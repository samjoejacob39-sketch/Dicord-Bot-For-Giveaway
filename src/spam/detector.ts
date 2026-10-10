import crypto from "crypto";
import {
  SpamDetector,
  SpamDetectionResult,
  SpamFactors,
  SpamCategory,
  UserSpamProfile,
  MessageRecord,
  UserState,
  GuildSettings,
} from "../types";

const MAX_MESSAGES_IN_WINDOW = 100;
const MESSAGE_WINDOW_MS = 60_000;
const SHORT_WINDOW_MS = 5_000;
const MED_WINDOW_MS = 10_000;
const HASH_LENGTH = 16;

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.includes(shorter) && shorter.length > 3) return shorter.length / longer.length;

  const shorterLen = shorter.length;
  let matches = 0;
  for (let i = 0; i < shorterLen; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
}

function hashMessage(content: string): string {
  return crypto.createHash("md5").update(content.toLowerCase().trim()).digest("hex").slice(0, HASH_LENGTH);
}

function countEmojis(text: string): number {
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
  return (text.match(emojiRegex) || []).length;
}

function countMentions(text: string): number {
  return (text.match(/<[@#!&]\d+>/g) || []).length;
}

function countLinks(text: string): number {
  return (text.match(/https?:\/\/[^\s]+/gi) || []).length;
}

function calculateCapsRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return 0;
  const caps = letters.replace(/[^A-Z]/g, "").length;
  return caps / letters.length;
}

function calculatePunctuationRatio(text: string): number {
  if (text.length === 0) return 0;
  const punct = text.replace(/[\w\s]/g, "").length;
  return punct / text.length;
}

function detectRewardFarming(messages: MessageRecord[]): number {
  if (messages.length < 3) return 0;

  const contents = messages.map((m) => m.content.toLowerCase().trim());
  const shortMessages = contents.filter((c) => c.length <= 5);
  const shortRatio = shortMessages.length / contents.length;

  const identical = new Map<string, number>();
  for (const c of contents) {
    identical.set(c, (identical.get(c) || 0) + 1);
  }
  const maxIdentical = Math.max(...identical.values());
  const identicalRatio = maxIdentical / contents.length;

  const rewardWords = ["gg", "reward", "free", "claim", "give", "xp", "level", "farm", "grind", "rep", "like", "sub"];
  let rewardMatches = 0;
  for (const c of contents) {
    const words = c.split(/\s+/);
    for (const w of words) {
      if (rewardWords.includes(w)) rewardMatches++;
    }
  }
  const rewardRatio = rewardMatches / Math.max(contents.length, 1);

  if (contents.length >= 3) {
    const alternating = checkAlternating(contents);
    if (alternating) return 85;
  }

  let score = 0;
  if (shortRatio > 0.7) score += 25;
  if (identicalRatio > 0.5) score += 35;
  if (rewardRatio > 0.3) score += 25;
  if (maxIdentical >= 4) score += 15;

  return Math.min(score, 100);
}

function checkAlternating(contents: string[]): boolean {
  if (contents.length < 4) return false;
  const unique = [...new Set(contents)];
  if (unique.length > 2) return false;
  for (let i = 2; i < contents.length; i++) {
    if (contents[i] !== contents[i - 2]) return false;
  }
  return true;
}

function calculateRepetitionScore(messages: MessageRecord[]): number {
  if (messages.length < 2) return 0;

  const hashes = messages.map((m) => hashMessage(m.content));
  const counts = new Map<string, number>();
  for (const h of hashes) {
    counts.set(h, (counts.get(h) || 0) + 1);
  }

  const maxCount = Math.max(...counts.values());
  const duplicateRatio = maxCount / messages.length;

  let score = 0;
  if (maxCount >= 2) score += 15;
  if (maxCount >= 3) score += 15;
  if (maxCount >= 5) score += 20;
  if (maxCount >= 8) score += 15;
  if (duplicateRatio > 0.5) score += 15;
  if (duplicateRatio > 0.7) score += 10;

  return Math.min(score, 100);
}

function calculateSimilarityScore(messages: MessageRecord[]): number {
  if (messages.length < 2) return 0;

  let totalSimilarity = 0;
  let pairs = 0;
  for (let i = 0; i < messages.length; i++) {
    for (let j = i + 1; j < messages.length; j++) {
      totalSimilarity += similarity(messages[i].content, messages[j].content);
      pairs++;
    }
  }

  const avgSimilarity = pairs > 0 ? totalSimilarity / pairs : 0;
  return Math.round(avgSimilarity * 100);
}

function calculateFrequencyScore(messages: MessageRecord[], now: number): SpamFactors["messageFrequency"] {
  const in5s = messages.filter((m) => now - m.timestamp <= SHORT_WINDOW_MS).length;
  const in10s = messages.filter((m) => now - m.timestamp <= MED_WINDOW_MS).length;
  const inMinute = messages.length;

  let score = 0;
  if (in5s >= 3) score += 20;
  if (in5s >= 5) score += 20;
  if (in5s >= 8) score += 15;
  if (in10s >= 5) score += 15;
  if (in10s >= 10) score += 10;
  if (inMinute >= 15) score += 10;
  if (inMinute >= 30) score += 10;

  return Math.min(score, 100);
}

export class LocalSpamDetector implements SpamDetector {
  private profiles = new Map<string, UserSpamProfile>();
  private guildSettings: (guildId: string) => GuildSettings;

  constructor(guildSettingsFn: (guildId: string) => GuildSettings) {
    this.guildSettings = guildSettingsFn;
  }

  private getProfileKey(userId: string, guildId: string): string {
    return `${guildId}:${userId}`;
  }

  getProfile(userId: string, guildId: string): UserSpamProfile {
    const key = this.getProfileKey(userId, guildId);
    let profile = this.profiles.get(key);
    if (!profile) {
      profile = {
        userId,
        guildId,
        messages: [],
        recentHashes: new Map(),
        channelActivity: new Map(),
        lastMessageTime: 0,
        currentScore: 0,
        state: UserState.NORMAL,
      };
      this.profiles.set(key, profile);
    }
    return profile;
  }

  resetProfile(userId: string, guildId: string): void {
    const key = this.getProfileKey(userId, guildId);
    this.profiles.delete(key);
  }

  private cleanupOldMessages(profile: UserSpamProfile, now: number): void {
    profile.messages = profile.messages.filter((m) => now - m.timestamp <= MESSAGE_WINDOW_MS);

    for (const [hash, count] of profile.recentHashes.entries()) {
      if (count <= 1) profile.recentHashes.delete(hash);
    }

    profile.channelActivity.clear();
    for (const msg of profile.messages) {
      profile.channelActivity.set(msg.channelId, (profile.channelActivity.get(msg.channelId) || 0) + 1);
    }
  }

  analyze(
    userId: string,
    guildId: string,
    content: string,
    channelId: string
  ): SpamDetectionResult {
    const now = Date.now();
    const profile = this.getProfile(userId, guildId);
    const settings = this.guildSettings(guildId);

    this.cleanupOldMessages(profile, now);

    const record: MessageRecord = {
      content,
      timestamp: now,
      channelId,
      messageId: crypto.randomUUID(),
    };
    profile.messages.push(record);
    profile.lastMessageTime = now;

    const hash = hashMessage(content);
    profile.recentHashes.set(hash, (profile.recentHashes.get(hash) || 0) + 1);

    const factors: SpamFactors = {
      messageFrequency: calculateFrequencyScore(profile.messages, now),
      repetitionScore: calculateRepetitionScore(profile.messages),
      similarityScore: calculateSimilarityScore(profile.messages),
      linkRepetition: this.calculateLinkRepetition(profile.messages),
      mentionExcess: this.calculateMentionExcess(profile.messages),
      emojiExcess: this.calculateEmojiExcess(profile.messages),
      characterExcess: this.calculateCharacterExcess(profile.messages),
      rewardFarming: detectRewardFarming(profile.messages),
      capsRatio: Math.round(calculateCapsRatio(content) * 100),
      punctuationRatio: Math.round(calculatePunctuationRatio(content) * 100),
      crossChannelSpam: this.calculateCrossChannelSpam(profile),
    };

    const weights = settings.weights;
    let weightedScore = 0;
    weightedScore += factors.messageFrequency * (weights.messageFrequency / 100);
    weightedScore += factors.repetitionScore * (weights.repetition / 100);
    weightedScore += factors.similarityScore * (weights.similarity / 100);
    weightedScore += factors.linkRepetition * (weights.linkRepetition / 100);
    weightedScore += factors.mentionExcess * (weights.mentionExcess / 100);
    weightedScore += factors.emojiExcess * (weights.emojiExcess / 100);
    weightedScore += factors.characterExcess * (weights.characterExcess / 100);
    weightedScore += factors.rewardFarming * (weights.rewardFarming / 100);
    weightedScore += factors.capsRatio * (weights.capsRatio / 100);
    weightedScore += factors.punctuationRatio * (weights.punctuationRatio / 100);
    weightedScore += factors.crossChannelSpam * (weights.crossChannelSpam / 100);

    const record2 = this.getUserModRecord(userId, guildId);
    weightedScore += Math.min(record2.warnings * weights.previousWarnings, 20);
    weightedScore += Math.min(record2.timeouts * weights.previousTimeouts, 20);

    const score = Math.min(Math.round(weightedScore), 100);
    profile.currentScore = score;

    const category = this.determineCategory(factors, content);
    const reasons = this.buildReasons(factors, profile.messages.length, category);

    const state = this.determineState(score, settings);
    profile.state = state;

    return {
      score,
      category,
      reasons,
      factors,
      shouldWarn: score >= settings.warningThreshold && score < settings.timeoutThreshold,
      shouldTimeout: score >= settings.timeoutThreshold && score < settings.severeTimeoutThreshold,
      shouldSevereTimeout: score >= settings.severeTimeoutThreshold && score < settings.extremeThreshold,
      shouldExtremeTimeout: score >= settings.extremeThreshold,
    };
  }

  private getUserModRecord(userId: string, guildId: string): { warnings: number; timeouts: number } {
    return { warnings: 0, timeouts: 0 };
  }

  private calculateLinkRepetition(messages: MessageRecord[]): number {
    const linkCounts = new Map<string, number>();
    let totalLinks = 0;
    for (const msg of messages) {
      const links = msg.content.match(/https?:\/\/[^\s]+/gi) || [];
      totalLinks += links.length;
      for (const link of links) {
        linkCounts.set(link, (linkCounts.get(link) || 0) + 1);
      }
    }
    if (totalLinks === 0) return 0;
    const maxLinkCount = Math.max(...linkCounts.values(), 0);
    let score = 0;
    if (totalLinks > 3) score += 15;
    if (totalLinks > 6) score += 15;
    if (maxLinkCount > 2) score += 20;
    if (maxLinkCount > 4) score += 20;
    return Math.min(score, 100);
  }

  private calculateMentionExcess(messages: MessageRecord[]): number {
    let totalMentions = 0;
    for (const msg of messages) {
      totalMentions += countMentions(msg.content);
    }
    if (totalMentions === 0) return 0;
    let score = 0;
    if (totalMentions > 3) score += 20;
    if (totalMentions > 6) score += 25;
    if (totalMentions > 10) score += 25;
    return Math.min(score, 100);
  }

  private calculateEmojiExcess(messages: MessageRecord[]): number {
    let totalEmojis = 0;
    let totalChars = 0;
    for (const msg of messages) {
      totalEmojis += countEmojis(msg.content);
      totalChars += msg.content.length;
    }
    if (totalChars === 0) return 0;
    const ratio = totalEmojis / totalChars;
    if (ratio > 0.5) return 80;
    if (ratio > 0.3) return 50;
    if (totalEmojis > 10) return 40;
    return 0;
  }

  private calculateCharacterExcess(messages: MessageRecord[]): number {
    const charCounts = messages.map((m) => m.content.length);
    const repeatedCharMessages = messages.filter((m) => /(.)\1{4,}/.test(m.content));
    let score = 0;
    if (repeatedCharMessages.length > 0) score += 20;
    if (repeatedCharMessages.length > 2) score += 20;
    const longMessages = charCounts.filter((c) => c > 500);
    if (longMessages.length > 2) score += 15;
    return Math.min(score, 100);
  }

  private calculateCrossChannelSpam(profile: UserSpamProfile): number {
    const channels = profile.channelActivity.size;
    if (channels <= 1) return 0;
    const recentMessages = profile.messages.filter(
      (m) => Date.now() - m.timestamp <= 30_000
    );
    const recentChannels = new Set(recentMessages.map((m) => m.channelId)).size;
    let score = 0;
    if (recentChannels >= 2) score += 20;
    if (recentChannels >= 3) score += 30;
    if (channels >= 4) score += 20;
    return Math.min(score, 100);
  }

  private determineCategory(
    factors: SpamFactors,
    content: string
  ): SpamCategory {
    if (factors.rewardFarming > 50) return SpamCategory.REWARD_FARMING;
    if (factors.repetitionScore > 60) return SpamCategory.REPETITIVE_SPAM;
    if (factors.messageFrequency > 70) return SpamCategory.MESSAGE_FLOOD;
    if (factors.linkRepetition > 40) return SpamCategory.LINK_SPAM;
    if (factors.mentionExcess > 40) return SpamCategory.MENTION_SPAM;
    if (factors.emojiExcess > 40) return SpamCategory.EMOJI_SPAM;
    if (factors.characterExcess > 40) return SpamCategory.CHARACTER_SPAM;
    if (factors.crossChannelSpam > 30) return SpamCategory.SUSPICIOUS;

    const totalScore =
      factors.messageFrequency +
      factors.repetitionScore +
      factors.similarityScore +
      factors.rewardFarming;
    if (totalScore > 100) return SpamCategory.SUSPICIOUS;

    return SpamCategory.NORMAL;
  }

  private determineState(score: number, settings: GuildSettings): UserState {
    if (score >= settings.extremeThreshold) return UserState.SEVERE;
    if (score >= settings.severeTimeoutThreshold) return UserState.TIMEOUT;
    if (score >= settings.timeoutThreshold) return UserState.REPEATED;
    if (score >= settings.warningThreshold) return UserState.WARNED;
    if (score >= 20) return UserState.SUSPICIOUS;
    return UserState.NORMAL;
  }

  private buildReasons(
    factors: SpamFactors,
    messageCount: number,
    category: SpamCategory
  ): string[] {
    const reasons: string[] = [];

    if (factors.messageFrequency > 30) {
      reasons.push(`${messageCount} messages in short window`);
    }
    if (factors.repetitionScore > 30) {
      reasons.push("Repeated identical messages detected");
    }
    if (factors.similarityScore > 40) {
      reasons.push(`${factors.similarityScore}% message similarity`);
    }
    if (factors.linkRepetition > 20) {
      reasons.push("Repeated links detected");
    }
    if (factors.mentionExcess > 20) {
      reasons.push("Excessive mentions");
    }
    if (factors.emojiExcess > 20) {
      reasons.push("Excessive emoji usage");
    }
    if (factors.characterExcess > 20) {
      reasons.push("Suspicious character patterns");
    }
    if (factors.rewardFarming > 20) {
      reasons.push("Reward-farming pattern detected");
    }
    if (factors.capsRatio > 70) {
      reasons.push("Excessive caps");
    }
    if (factors.crossChannelSpam > 20) {
      reasons.push("Cross-channel spam detected");
    }

    if (reasons.length === 0 && category !== SpamCategory.NORMAL) {
      reasons.push("Suspicious behavior pattern");
    }

    return reasons;
  }
}
