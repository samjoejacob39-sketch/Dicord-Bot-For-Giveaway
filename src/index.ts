import { Client, GatewayIntentBits, Events } from "discord.js";
import { config } from "./config";
import { SQLiteService } from "./database";
import { LocalSpamDetector } from "./spam/detector";
import { OpenRouterAI } from "./ai/openrouter";
import { DiscordModerationService } from "./moderation";
import { MessageHandler } from "./events/messageHandler";
import { antispamCommand, handleAntispamCommand } from "./commands/antispam";
import { accgiverCommand, handleAccgiverCommand } from "./commands/accgiver";
import { setLogLevel, setLogFile, logger } from "./utils/logger";

setLogLevel(config.logLevel as any);
setLogFile("./data/bot.log");

if (!config.discordToken) {
  console.error("DISCORD_TOKEN is required in .env");
  process.exit(1);
}

async function main() {
  const db = new SQLiteService(config.databasePath);
  await db.init();

  const getSettings = (guildId: string) => db.getGuildSettings(guildId);

  const ai =
    config.aiEnabled && config.openrouterApiKey
      ? new OpenRouterAI(
          config.openrouterApiKey,
          config.openrouterModel,
          config.aiMaxRequestsPerGuildPerMinute,
          config.aiMaxRequestsPerUserPerMinute
        )
      : null;

  const detector = new LocalSpamDetector(getSettings);
  const moderation = new DiscordModerationService(db, ai, getSettings);
  const messageHandler = new MessageHandler(detector, moderation, db, getSettings);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info(`Logged in as ${c.user?.tag} (${c.user?.id})`);
    logger.info(`Monitoring ${c.guilds.cache.size} guild(s)`);
    c.guilds.cache.forEach((g) => logger.info(`  Guild: ${g.name} (${g.id})`));
    c.user?.setActivity("🛡️ Anti-Spam Active");
  });

  client.on(Events.GuildCreate, (guild) => {
    logger.info(`Joined guild: ${guild.name} (${guild.id})`);
  });

  client.on(Events.MessageCreate, async (message) => {
    logger.debug(`RECEIVED MESSAGE: guild=${message.guild?.id || "DM"} author=${message.author.tag} content="${message.content.slice(0, 50)}" bot=${message.author.bot}`);
    try {
      await messageHandler.handleMessage(message);
    } catch (err) {
      logger.error("Error handling message:", err);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "antispam") {
      try {
        await handleAntispamCommand(
          interaction,
          db,
          (userId, guildId) => detector.resetProfile(userId, guildId),
          detector
        );
      } catch (err) {
        logger.error("Error handling antispam command:", err);
        const reply = {
          content: "An error occurred while executing this command.",
          ephemeral: true,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
    } else if (interaction.commandName === "accgiver") {
      try {
        await handleAccgiverCommand(interaction, db);
      } catch (err) {
        logger.error("Error handling accgiver command:", err);
        const reply = {
          content: "An error occurred while executing the account command.",
          ephemeral: true,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
    }
  });

  process.on("SIGINT", () => {
    logger.info("Shutting down...");
    db.close();
    client.destroy();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Shutting down...");
    db.close();
    client.destroy();
    process.exit(0);
  });

  await client.login(config.discordToken);
}

main().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
