import { EmbedBuilder, TextChannel, GuildMember, PermissionFlagsBits, Guild, Client } from "discord.js";
import { ModerationAction, ModerationEvent, GuildSettings, SpamCategory } from "../types";
import { logger } from "./logger";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hour${hours !== 1 ? "s" : ""}`;
  return `${hours}h ${mins}m`;
}

function actionToString(action: ModerationAction): string {
  switch (action) {
    case ModerationAction.WARNING: return "Warning";
    case ModerationAction.STRONG_WARNING: return "Strong Warning";
    case ModerationAction.TIMEOUT: return "Timeout";
    case ModerationAction.SEVERE_TIMEOUT: return "Severe Timeout";
    case ModerationAction.EXTREME_TIMEOUT: return "Extreme Timeout";
    case ModerationAction.KICK: return "Kick";
    case ModerationAction.BAN: return "Ban";
    default: return "None";
  }
}

function categoryToString(cat: SpamCategory): string {
  switch (cat) {
    case SpamCategory.REPETITIVE_SPAM: return "Repetitive Spam";
    case SpamCategory.MESSAGE_FLOOD: return "Message Flood";
    case SpamCategory.REWARD_FARMING: return "Reward Farming";
    case SpamCategory.LINK_SPAM: return "Link Spam";
    case SpamCategory.MENTION_SPAM: return "Mention Spam";
    case SpamCategory.EMOJI_SPAM: return "Emoji Spam";
    case SpamCategory.CHARACTER_SPAM: return "Character Spam";
    case SpamCategory.SUSPICIOUS: return "Suspicious";
    default: return "Normal";
  }
}

function getWarningMessage(action: ModerationAction): string {
  if (action === ModerationAction.STRONG_WARNING) {
    return "⚠️ Hey, repeated messages are being detected again. Please give the chat a break or you'll be muted.";
  }
  return "⚠️ Slow down a bit — you're sending messages too quickly. Please stop spamming.";
}

function getTimeoutMessage(duration: string): string {
  return `🛑 You've continued spamming after warnings. You've been temporarily muted for ${duration}.`;
}

export async function executeModeration(
  event: ModerationEvent,
  settings: GuildSettings,
  guild: Guild
): Promise<void> {
  if (event.action === ModerationAction.NONE) return;

  let targetMember: GuildMember | null = null;
  try {
    targetMember = await guild.members.fetch(event.userId);
  } catch {
    logger.error(`Could not fetch target member ${event.userId}`);
    return;
  }

  if (!targetMember) return;
  if (targetMember.user.bot) return;
  if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) return;

  const botMember = guild.members.me;
  if (!botMember) return;

  if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    logger.error("Bot lacks ModerateMembers permission");
    return;
  }

  if (botMember.roles.highest.position <= targetMember.roles.highest.position) {
    logger.error(`Cannot moderate ${targetMember.user.tag}: role hierarchy`);
    return;
  }

  if (event.action === ModerationAction.WARNING || event.action === ModerationAction.STRONG_WARNING) {
    const msg = getWarningMessage(event.action);

    if (settings.warningChannelId) {
      try {
        const ch = guild.channels.cache.get(settings.warningChannelId) as TextChannel;
        if (ch) await ch.send(msg);
      } catch (err) {
        logger.error("Failed to send warning to warning channel:", err);
      }
    }

    try {
      const ch = guild.channels.cache.get(event.channelId) as TextChannel;
      if (ch) await ch.send({ content: `${targetMember} ${msg}` });
    } catch (err) {
      logger.error("Failed to send warning to channel:", err);
    }
    return;
  }

  let timeoutMinutes = settings.defaultTimeoutMinutes;
  if (event.action === ModerationAction.SEVERE_TIMEOUT) timeoutMinutes = settings.severeTimeoutMinutes;
  if (event.action === ModerationAction.EXTREME_TIMEOUT) timeoutMinutes = settings.extremeTimeoutMinutes;

  const durationMs = timeoutMinutes * 60 * 1000;

  try {
    await targetMember.timeout(durationMs, `Anti-spam: Score ${event.spamScore} - ${event.category}`);
    logger.info(`Timed out ${targetMember.user.tag} for ${formatDuration(timeoutMinutes)}`);

    const durationStr = formatDuration(timeoutMinutes);
    const msg = getTimeoutMessage(durationStr);

    try {
      const ch = guild.channels.cache.get(event.channelId) as TextChannel;
      if (ch) await ch.send({ content: `${targetMember} ${msg}` });
    } catch (err) {
      logger.error("Failed to send timeout message:", err);
    }
  } catch (err) {
    logger.error(`Failed to timeout ${targetMember.user.tag}:`, err);
  }
}

export function buildLogEmbed(event: ModerationEvent): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🛡️ Anti-Spam Incident")
    .setColor(event.action === ModerationAction.NONE ? 0x3498db : 0xe74c3c)
    .addFields(
      { name: "User", value: `<@${event.userId}> (${event.userId})`, inline: true },
      { name: "Channel", value: `<#${event.channelId}>`, inline: true },
      { name: "Spam Score", value: `${event.spamScore}`, inline: true },
      { name: "Category", value: categoryToString(event.category), inline: true },
      { name: "Action", value: actionToString(event.action), inline: true }
    )
    .setTimestamp(event.timestamp);

  if (event.reasons.length > 0) {
    embed.addFields({
      name: "Detection",
      value: event.reasons.map((r) => `• ${r}`).join("\n"),
    });
  }

  if (event.aiUsed) {
    embed.addFields({
      name: "AI",
      value: `Confidence: ${event.aiConfidence ? (event.aiConfidence * 100).toFixed(0) + "%" : "N/A"}`,
    });
  }

  return embed;
}
