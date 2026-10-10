import dotenv from "dotenv";
import { GuildSettings, ScoringWeights } from "../types";

dotenv.config();

function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val === undefined || val === "") return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function envBool(key: string, defaultValue: boolean): boolean {
  const val = process.env[key];
  if (val === undefined || val === "") return defaultValue;
  return val.toLowerCase() === "true" || val === "1";
}

function envString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  discordToken: envString("DISCORD_TOKEN", ""),
  openrouterApiKey: envString("OPENROUTER_API_KEY", ""),
  openrouterModel: envString("OPENROUTER_MODEL", "openrouter/free"),
  aiEnabled: envBool("AI_ENABLED", true),
  databasePath: envString("DATABASE_PATH", "./data/antispam.sqlite"),
  warningThreshold: envInt("WARNING_THRESHOLD", 45),
  timeoutThreshold: envInt("TIMEOUT_THRESHOLD", 65),
  severeTimeoutThreshold: envInt("SEVERE_TIMEOUT_THRESHOLD", 80),
  extremeThreshold: envInt("EXTREME_THRESHOLD", 95),
  defaultTimeoutMinutes: envInt("DEFAULT_TIMEOUT_MINUTES", 60),
  severeTimeoutMinutes: envInt("SEVERE_TIMEOUT_MINUTES", 240),
  extremeTimeoutMinutes: envInt("EXTREME_TIMEOUT_MINUTES", 1440),
  aiMaxRequestsPerGuildPerMinute: envInt("AI_MAX_REQUESTS_PER_GUILD_PER_MINUTE", 10),
  aiMaxRequestsPerUserPerMinute: envInt("AI_MAX_REQUESTS_PER_USER_PER_MINUTE", 2),
  warningCooldownSeconds: envInt("WARNING_COOLDOWN_SECONDS", 30),
  logLevel: envString("LOG_LEVEL", "info"),
};

export function getDefaultGuildSettings(guildId: string): GuildSettings {
  return {
    guildId,
    enabled: true,
    warningThreshold: config.warningThreshold,
    timeoutThreshold: config.timeoutThreshold,
    severeTimeoutThreshold: config.severeTimeoutThreshold,
    extremeThreshold: config.extremeThreshold,
    defaultTimeoutMinutes: config.defaultTimeoutMinutes,
    severeTimeoutMinutes: config.severeTimeoutMinutes,
    extremeTimeoutMinutes: config.extremeTimeoutMinutes,
    aiEnabled: config.aiEnabled,
    logChannelId: null,
    warningChannelId: null,
    ignoredChannels: [],
    ignoredRoles: [],
    ignoredUsers: [],
    ignoreBots: true,
    warningCooldownSeconds: config.warningCooldownSeconds,
    decayHours24: 25,
    decayDays7: 50,
    decayDays30: 80,
    weights: getDefaultWeights(),
  };
}

export function getDefaultWeights(): ScoringWeights {
  return {
    messageFrequency: 20,
    repetition: 25,
    similarity: 15,
    linkRepetition: 10,
    mentionExcess: 10,
    emojiExcess: 8,
    characterExcess: 5,
    rewardFarming: 30,
    capsRatio: 3,
    punctuationRatio: 2,
    crossChannelSpam: 10,
    previousWarnings: 5,
    previousTimeouts: 8,
  };
}
