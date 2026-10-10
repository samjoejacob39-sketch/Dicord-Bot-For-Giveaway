import crypto from "crypto";
import {
  ModerationService,
  ModerationEvent,
  ModerationAction,
  SpamDetectionResult,
  SpamCategory,
  UserModerationRecord,
  UserState,
  GuildSettings,
  DatabaseService,
  AIProvider,
  AIContext,
} from "../types";

export class DiscordModerationService implements ModerationService {
  private db: DatabaseService;
  private ai: AIProvider | null;
  private getSettings: (guildId: string) => GuildSettings;
  private moderationCooldowns = new Map<string, number>();

  constructor(
    db: DatabaseService,
    ai: AIProvider | null,
    getSettings: (guildId: string) => GuildSettings
  ) {
    this.db = db;
    this.ai = ai;
    this.getSettings = getSettings;
  }

  getRecord(userId: string, guildId: string): UserModerationRecord {
    return this.db.getUserRecord(userId, guildId);
  }

  getIncidents(guildId: string, limit?: number): ModerationEvent[] {
    return this.db.getIncidents(guildId, limit);
  }

  async handleSpamDetection(
    userId: string,
    guildId: string,
    channelId: string,
    result: SpamDetectionResult,
    recentMessages?: string[]
  ): Promise<ModerationEvent> {
    const settings = this.getSettings(guildId);
    const record = this.db.getUserRecord(userId, guildId);

    const cooldownKey = `${guildId}:${userId}`;
    const lastMod = this.moderationCooldowns.get(cooldownKey) || 0;
    const now = Date.now();

    let aiClassification = null;
    let aiUsed = false;
    let aiConfidence = null;

    if (
      settings.aiEnabled &&
      this.ai &&
      result.score >= settings.warningThreshold &&
      result.score < settings.extremeThreshold &&
      now - lastMod > 10_000 &&
      recentMessages
    ) {
      const aiContext: AIContext = {
        userId,
        guildId,
        recentMessages: recentMessages.slice(-10),
        messagesLast5Seconds: result.factors.messageFrequency > 40 ? 5 : 2,
        messagesLast10Seconds: result.factors.messageFrequency > 40 ? 8 : 3,
        messagesLastMinute: recentMessages.length,
        duplicateRatio: result.factors.repetitionScore / 100,
        currentSpamScore: result.score,
        previousWarnings: record.warnings,
        category: result.category,
      };

      aiClassification = await this.ai.classify(aiContext);
      if (aiClassification) {
        aiUsed = true;
        aiConfidence = aiClassification.confidence;

        if (!aiClassification.is_spam && result.score < settings.severeTimeoutThreshold) {
          const event = this.createEvent(userId, guildId, channelId, ModerationAction.NONE, result, aiUsed, aiConfidence, aiClassification);
          this.db.addIncident(event);
          return event;
        }
      }
    }

    const action = this.determineAction(result, record, settings);

    if (action !== ModerationAction.NONE) {
      if (now - lastMod < (settings.warningCooldownSeconds * 1000) && action === ModerationAction.WARNING) {
        const event = this.createEvent(userId, guildId, channelId, ModerationAction.NONE, result, aiUsed, aiConfidence, aiClassification);
        this.db.addIncident(event);
        return event;
      }
      this.moderationCooldowns.set(cooldownKey, now);
    }

    const event = this.createEvent(userId, guildId, channelId, action, result, aiUsed, aiConfidence, aiClassification);
    this.db.addIncident(event);
    this.updateUserRecord(userId, guildId, action, result.score);

    return event;
  }

  private determineAction(
    result: SpamDetectionResult,
    record: UserModerationRecord,
    settings: GuildSettings
  ): ModerationAction {
    if (result.shouldExtremeTimeout) {
      if (record.warnings > 0 || record.timeouts > 0) {
        return ModerationAction.EXTREME_TIMEOUT;
      }
      return ModerationAction.SEVERE_TIMEOUT;
    }

    if (result.shouldSevereTimeout) {
      if (record.timeouts > 0) {
        return ModerationAction.SEVERE_TIMEOUT;
      }
      return ModerationAction.TIMEOUT;
    }

    if (result.shouldTimeout) {
      if (record.warnings >= 2) {
        return ModerationAction.TIMEOUT;
      }
      if (record.warnings >= 1) {
        return ModerationAction.STRONG_WARNING;
      }
      return ModerationAction.WARNING;
    }

    if (result.shouldWarn) {
      if (record.warnings >= 2) {
        return ModerationAction.TIMEOUT;
      }
      if (record.warnings >= 1) {
        return ModerationAction.STRONG_WARNING;
      }
      return ModerationAction.WARNING;
    }

    return ModerationAction.NONE;
  }

  private updateUserRecord(userId: string, guildId: string, action: ModerationAction, spamScore: number): void {
    const record = this.db.getUserRecord(userId, guildId);
    const now = Date.now();

    const updates: Partial<UserModerationRecord> = {
      lastViolation: now,
      totalSpamScore: record.totalSpamScore + spamScore,
      spamIncidents: record.spamIncidents + 1,
    };

    switch (action) {
      case ModerationAction.WARNING:
      case ModerationAction.STRONG_WARNING:
        updates.warnings = record.warnings + 1;
        updates.lastWarning = now;
        updates.state = UserState.WARNED;
        break;
      case ModerationAction.TIMEOUT:
      case ModerationAction.SEVERE_TIMEOUT:
      case ModerationAction.EXTREME_TIMEOUT:
        updates.timeouts = record.timeouts + 1;
        updates.lastTimeout = now;
        updates.state = UserState.TIMEOUT;
        updates.violationSeverity = Math.min(record.violationSeverity + 20, 100);
        break;
    }

    this.db.updateUserRecord(userId, guildId, updates);
  }

  private createEvent(
    userId: string,
    guildId: string,
    channelId: string,
    action: ModerationAction,
    result: SpamDetectionResult,
    aiUsed: boolean,
    aiConfidence: number | null,
    aiClassification: any
  ): ModerationEvent {
    return {
      id: crypto.randomUUID(),
      userId,
      guildId,
      channelId,
      action,
      spamScore: result.score,
      category: result.category,
      reasons: result.reasons,
      aiUsed,
      aiConfidence,
      aiClassification,
      timestamp: Date.now(),
    };
  }
}
