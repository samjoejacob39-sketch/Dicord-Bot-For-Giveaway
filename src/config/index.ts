import dotenv from "dotenv";

dotenv.config();

function envString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  discordToken: envString("DISCORD_TOKEN", ""),
  databasePath: envString("DATABASE_PATH", "./data/giveaway.sqlite"),
  logLevel: envString("LOG_LEVEL", "info"),
};
