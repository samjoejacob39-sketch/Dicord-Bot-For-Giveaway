import { REST, Routes } from "discord.js";
import { antispamCommand } from "./commands/antispam";
import { accgiverCommand } from "./commands/accgiver";
import { config } from "./config";

async function deployCommands() {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const guildId = process.env.GUILD_ID;
  const clientId = process.env.CLIENT_ID || "1541673462190313503";

  try {
    console.log("Deploying slash commands...");

    const commands = [antispamCommand.toJSON(), accgiverCommand.toJSON()];

    let data;
    if (guildId) {
      console.log(`Deploying to guild ${guildId} (instant)...`);
      data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
    } else {
      console.log("Deploying globally (may take up to 1 hour)...");
      data = await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });
    }

    console.log(`Successfully deployed ${(data as any[]).length} commands.`);
  } catch (error) {
    console.error("Failed to deploy commands:", error);
  }
}

deployCommands();
