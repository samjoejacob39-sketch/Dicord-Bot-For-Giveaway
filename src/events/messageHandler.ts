import { Message, TextChannel, PermissionFlagsBits } from "discord.js";
import { LocalSpamDetector } from "../spam/detector";
import { DiscordModerationService } from "../moderation";
import { DatabaseService, GuildSettings } from "../types";
import { buildLogEmbed, executeModeration } from "../utils/helpers";
import { logger } from "../utils/logger";

export class MessageHandler {
  private detector: LocalSpamDetector;
  private moderation: DiscordModerationService;
  private db: DatabaseService;
  private getSettings: (guildId: string) => GuildSettings;

  constructor(
    detector: LocalSpamDetector,
    moderation: DiscordModerationService,
    db: DatabaseService,
    getSettings: (guildId: string) => GuildSettings
  ) {
    this.detector = detector;
    this.moderation = moderation;
    this.db = db;
    this.getSettings = getSettings;
  }

  async handleMessage(message: Message): Promise<void> {
    if (!message.guild) return;
    if (message.author.bot) return;

    const guildId = message.guild.id;
    const settings = this.getSettings(guildId);

    logger.debug(`[${guildId}] handleMessage: enabled=${settings.enabled} author=${message.author.tag} admin=${message.member?.permissions.has(PermissionFlagsBits.Administrator)} manageMsgs=${message.member?.permissions.has(PermissionFlagsBits.ManageMessages)}`);

    if (!settings.enabled) { logger.debug(`[${guildId}] SKIP: disabled`); return; }
    if (settings.ignoredChannels.includes(message.channel.id)) return;
    if (settings.ignoredUsers.includes(message.author.id)) return;

    const member = message.member;
    if (!member) return;

    if (settings.ignoredRoles.some((roleId) => member.roles.cache.has(roleId))) return;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) { logger.debug(`[${guildId}] SKIP: admin`); return; }
    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) { logger.debug(`[${guildId}] SKIP: manageMsgs`); return; }

    const result = this.detector.analyze(
      message.author.id,
      guildId,
      message.content,
      message.channel.id
    );

    logger.debug(
      `[${guildId}] ${message.author.tag}: score=${result.score} cat=${result.category}`
    );

    if (result.score < settings.warningThreshold) return;

    logger.warn(
      `[${guildId}] SPAM: ${message.author.tag} score=${result.score} reasons=${result.reasons.join("; ")}`
    );

    const profile = this.detector.getProfile(message.author.id, guildId);
    const recentMessages = profile.messages.map((m) => m.content);

    const event = await this.moderation.handleSpamDetection(
      message.author.id,
      guildId,
      message.channel.id,
      result,
      recentMessages
    );

    logger.info(`[${guildId}] ACTION: ${event.action} for ${message.author.tag} (score ${event.spamScore})`);

    if (settings.logChannelId) {
      try {
        const logChannel = message.guild.channels.cache.get(settings.logChannelId);
        if (logChannel && logChannel.isTextBased()) {
          await (logChannel as TextChannel).send({ embeds: [buildLogEmbed(event)] });
        }
      } catch (err) {
        logger.error("Failed to send log embed:", err);
      }
    }

    await executeModeration(event, settings, message.guild);
  }
}
