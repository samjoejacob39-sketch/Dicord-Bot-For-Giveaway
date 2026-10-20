import { Client, GatewayIntentBits, Events, MessageFlags } from "discord.js";
import type { InteractionReplyOptions } from "discord.js";
import { config } from "./config";
import { SQLiteService } from "./database";
import { handleAccgiverCommand } from "./commands/accgiver";
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

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info(`Logged in as ${c.user?.tag} (${c.user?.id})`);
    logger.info(`Serving ${c.guilds.cache.size} guild(s)`);
    c.guilds.cache.forEach((g) => logger.info(`  Guild: ${g.name} (${g.id})`));
    c.user?.setActivity("🎁 Account Drops");
  });

  client.on(Events.GuildCreate, (guild) => {
    logger.info(`Joined guild: ${guild.name} (${guild.id})`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "accgiver") {
      try {
        await handleAccgiverCommand(interaction, db);
      } catch (err) {
        logger.error("Error handling accgiver command:", err);
        const reply: InteractionReplyOptions = {
          content: "An error occurred while executing the account command.",
          flags: MessageFlags.Ephemeral,
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
