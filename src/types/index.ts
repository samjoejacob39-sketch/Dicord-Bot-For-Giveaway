export enum SpamScore {
  NORMAL = 0,
  SUSPICIOUS = 21,
  MILD = 41,
  SERIOUS = 61,
  HEAVY = 76,
  EXTREME = 91,
}

export enum ModerationAction {
  NONE = "none",
  WARNING = "warning",
  STRONG_WARNING = "strong_warning",
  TIMEOUT = "timeout",
  SEVERE_TIMEOUT = "severe_timeout",
  EXTREME_TIMEOUT = "extreme_timeout",
  KICK = "kick",
  BAN = "ban",
}

export enum UserState {
  NORMAL = "normal",
  SUSPICIOUS = "suspicious",
  WARNED = "warned",
  REPEATED = "repeated",
  TIMEOUT = "timeout",
  SEVERE = "severe",
}

export enum SpamCategory {
  NORMAL = "normal",
  REPETITIVE_SPAM = "repetitive_spam",
  MESSAGE_FLOOD = "message_flood",
  REWARD_FARMING = "reward_farming",
  LINK_SPAM = "link_spam",
  MENTION_SPAM = "mention_spam",
  EMOJI_SPAM = "emoji_spam",
  CHARACTER_SPAM = "character_spam",
  SUSPICIOUS = "suspicious",
  UNKNOWN = "unknown",
}

export interface MessageRecord {
  content: string;
  timestamp: number;
  channelId: string;
  messageId: string;
}

export interface SpamDetectionResult {
  score: number;
  category: SpamCategory;
  reasons: string[];
  factors: SpamFactors;
  shouldWarn: boolean;
  shouldTimeout: boolean;
  shouldSevereTimeout: boolean;
  shouldExtremeTimeout: boolean;
}

export interface SpamFactors {
  messageFrequency: number;
  repetitionScore: number;
  similarityScore: number;
  linkRepetition: number;
  mentionExcess: number;
  emojiExcess: number;
  characterExcess: number;
  rewardFarming: number;
  capsRatio: number;
  punctuationRatio: number;
  crossChannelSpam: number;
}

export interface AIClassification {
  is_spam: boolean;
  confidence: number;
  severity: number;
  category: SpamCategory;
  reason: string;
  recommended_action: string;
}

export interface AIContext {
  userId: string;
  guildId: string;
  recentMessages: string[];
  messagesLast5Seconds: number;
  messagesLast10Seconds: number;
  messagesLastMinute: number;
  duplicateRatio: number;
  currentSpamScore: number;
  previousWarnings: number;
  category: SpamCategory;
}

export interface ModerationEvent {
  id: string;
  userId: string;
  guildId: string;
  channelId: string;
  action: ModerationAction;
  spamScore: number;
  category: SpamCategory;
  reasons: string[];
  aiUsed: boolean;
  aiConfidence: number | null;
  aiClassification: AIClassification | null;
  timestamp: number;
}

export interface UserModerationRecord {
  userId: string;
  guildId: string;
  warnings: number;
  timeouts: number;
  spamIncidents: number;
  lastViolation: number | null;
  lastWarning: number | null;
  lastTimeout: number | null;
  violationSeverity: number;
  totalSpamScore: number;
  state: UserState;
}

export interface GuildSettings {
  guildId: string;
  enabled: boolean;
  warningThreshold: number;
  timeoutThreshold: number;
  severeTimeoutThreshold: number;
  extremeThreshold: number;
  defaultTimeoutMinutes: number;
  severeTimeoutMinutes: number;
  extremeTimeoutMinutes: number;
  aiEnabled: boolean;
  logChannelId: string | null;
  warningChannelId: string | null;
  ignoredChannels: string[];
  ignoredRoles: string[];
  ignoredUsers: string[];
  ignoreBots: boolean;
  warningCooldownSeconds: number;
  decayHours24: number;
  decayDays7: number;
  decayDays30: number;
  weights: ScoringWeights;
}

export interface ScoringWeights {
  messageFrequency: number;
  repetition: number;
  similarity: number;
  linkRepetition: number;
  mentionExcess: number;
  emojiExcess: number;
  characterExcess: number;
  rewardFarming: number;
  capsRatio: number;
  punctuationRatio: number;
  crossChannelSpam: number;
  previousWarnings: number;
  previousTimeouts: number;
}

export interface UserSpamProfile {
  userId: string;
  guildId: string;
  messages: MessageRecord[];
  recentHashes: Map<string, number>;
  channelActivity: Map<string, number>;
  lastMessageTime: number;
  currentScore: number;
  state: UserState;
}

export interface AIProvider {
  classify(context: AIContext): Promise<AIClassification | null>;
}

export interface SpamDetector {
  analyze(userId: string, guildId: string, content: string, channelId: string): SpamDetectionResult;
  getProfile(userId: string, guildId: string): UserSpamProfile;
  resetProfile(userId: string, guildId: string): void;
}

export interface ModerationService {
  handleSpamDetection(userId: string, guildId: string, channelId: string, result: SpamDetectionResult): Promise<ModerationEvent>;
  getRecord(userId: string, guildId: string): UserModerationRecord;
  getIncidents(guildId: string, limit?: number): ModerationEvent[];
}

export * from "./accounts";
import {
  AccountRecord,
  AccountCategory,
  AccountDistributionRecord,
  InventorySummary,
  GetAccountsFilter,
} from "./accounts";

export interface DatabaseService {
  init(): Promise<void>;
  getGuildSettings(guildId: string): GuildSettings;
  updateGuildSettings(guildId: string, settings: Partial<GuildSettings>): void;
  getUserRecord(userId: string, guildId: string): UserModerationRecord;
  updateUserRecord(userId: string, guildId: string, record: Partial<UserModerationRecord>): void;
  addIncident(event: ModerationEvent): void;
  getIncidents(guildId: string, limit?: number): ModerationEvent[];
  // Account drop system methods
  addAccount(account: AccountRecord): void;
  getAccountByUsername(username: string): AccountRecord | null;
  getAccountById(id: string): AccountRecord | null;
  getAccountByRef(accountRef: string): AccountRecord | null;
  updateAccount(id: string, updates: Partial<AccountRecord>): void;
  updateAccountCategory(username: string, category: AccountCategory): boolean;
  deleteAccount(username: string): boolean;
  getAvailableAccountByCategory(category: AccountCategory, isPremium?: boolean): AccountRecord | null;
  recordDrop(drop: AccountDistributionRecord): void;
  getInventorySummary(): InventorySummary;
  getAccounts(filter?: GetAccountsFilter): { accounts: AccountRecord[]; total: number };
  getDistributionHistory(filter?: { accountId?: string; limit?: number }): AccountDistributionRecord[];
  close(): void;
}
