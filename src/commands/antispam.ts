import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { DatabaseService, GuildSettings, UserState, SpamCategory } from "../types";
import { getDefaultGuildSettings } from "../config";
import { LocalSpamDetector } from "../spam/detector";
import { logger } from "../utils/logger";

export const antispamCommand = new SlashCommandBuilder()
  .setName("antispam")
  .setDescription("Configure the anti-spam system")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName("enable").setDescription("Enable anti-spam for this server")
  )
  .addSubcommand((sub) =>
    sub.setName("disable").setDescription("Disable anti-spam for this server")
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Show current anti-spam configuration")
  )
  .addSubcommand((sub) =>
    sub
      .setName("config")
      .setDescription("Update anti-spam settings")
      .addIntegerOption((opt) =>
        opt
          .setName("warning_threshold")
          .setDescription("Spam score threshold for warnings (0-100)")
          .setMinValue(0)
          .setMaxValue(100)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("timeout_threshold")
          .setDescription("Spam score threshold for timeouts (0-100)")
          .setMinValue(0)
          .setMaxValue(100)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("timeout_minutes")
          .setDescription("Default timeout duration in minutes")
          .setMinValue(1)
          .setMaxValue(40320)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("severe_timeout_minutes")
          .setDescription("Severe timeout duration in minutes")
          .setMinValue(1)
          .setMaxValue(40320)
      )
      .addBooleanOption((opt) =>
        opt.setName("ai_enabled").setDescription("Enable AI-assisted detection")
      )
      .addChannelOption((opt) =>
        opt
          .setName("log_channel")
          .setDescription("Channel for moderation logs")
          .addChannelTypes(0)
      )
      .addChannelOption((opt) =>
        opt
          .setName("warning_channel")
          .setDescription("Channel for warning messages")
          .addChannelTypes(0)
      )
      .addRoleOption((opt) =>
        opt.setName("ignore_role").setDescription("Role to ignore from anti-spam")
      )
      .addChannelOption((opt) =>
        opt
          .setName("ignore_channel")
          .setDescription("Channel to ignore from anti-spam")
          .addChannelTypes(0)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("user")
      .setDescription("Show a user's spam statistics")
      .addUserOption((opt) =>
        opt.setName("target").setDescription("The user to check").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("history")
      .setDescription("Show recent anti-spam incidents")
      .addIntegerOption((opt) =>
        opt
          .setName("limit")
          .setDescription("Number of incidents to show (1-25)")
          .setMinValue(1)
          .setMaxValue(25)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("reset")
      .setDescription("Reset a user's spam record")
      .addUserOption((opt) =>
        opt.setName("target").setDescription("The user to reset").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("simulate")
      .setDescription("SIMULATE spam from a user (no real punishment) to test detection")
      .addUserOption((opt) =>
        opt.setName("target").setDescription("User to simulate spam for").setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt.setName("count").setDescription("Number of spam messages (3-20)").setMinValue(3).setMaxValue(20)
      )
      .addStringOption((opt) =>
        opt.setName("message").setDescription("Spam message to repeat (default: 'gg')")
      )
  );

export async function handleAntispamCommand(
  interaction: ChatInputCommandInteraction,
  db: DatabaseService,
  detectorReset: (userId: string, guildId: string) => void,
  detector?: LocalSpamDetector
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  switch (sub) {
    case "enable": {
      const settings = db.getGuildSettings(guildId);
      db.updateGuildSettings(guildId, { ...settings, enabled: true });
      await interaction.reply({ content: "✅ Anti-spam enabled for this server.", ephemeral: true });
      break;
    }

    case "disable": {
      const settings = db.getGuildSettings(guildId);
      db.updateGuildSettings(guildId, { ...settings, enabled: false });
      await interaction.reply({ content: "❌ Anti-spam disabled for this server.", ephemeral: true });
      break;
    }

    case "status": {
      const settings = db.getGuildSettings(guildId);
      const embed = new EmbedBuilder()
        .setTitle("🛡️ Anti-Spam Status")
        .setColor(settings.enabled ? 0x2ecc71 : 0xe74c3c)
        .addFields(
          { name: "Enabled", value: settings.enabled ? "Yes" : "No", inline: true },
          { name: "Warning Threshold", value: `${settings.warningThreshold}`, inline: true },
          { name: "Timeout Threshold", value: `${settings.timeoutThreshold}`, inline: true },
          { name: "Severe Threshold", value: `${settings.severeTimeoutThreshold}`, inline: true },
          { name: "Extreme Threshold", value: `${settings.extremeThreshold}`, inline: true },
          { name: "Default Timeout", value: `${settings.defaultTimeoutMinutes}m`, inline: true },
          { name: "Severe Timeout", value: `${settings.severeTimeoutMinutes}m`, inline: true },
          { name: "Extreme Timeout", value: `${settings.extremeTimeoutMinutes}m`, inline: true },
          { name: "AI Enabled", value: settings.aiEnabled ? "Yes" : "No", inline: true },
          { name: "Log Channel", value: settings.logChannelId ? `<#${settings.logChannelId}>` : "Not set", inline: true },
          { name: "Warning Channel", value: settings.warningChannelId ? `<#${settings.warningChannelId}>` : "Not set", inline: true },
          { name: "Ignored Channels", value: settings.ignoredChannels.length > 0 ? settings.ignoredChannels.map((id) => `<#${id}>`).join(", ") : "None", inline: false },
          { name: "Ignored Roles", value: settings.ignoredRoles.length > 0 ? settings.ignoredRoles.map((id) => `<@&${id}>`).join(", ") : "None", inline: false },
          { name: "Ignored Users", value: settings.ignoredUsers.length > 0 ? settings.ignoredUsers.map((id) => `<@${id}>`).join(", ") : "None", inline: false }
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "config": {
      const settings = db.getGuildSettings(guildId);
      const updates: Partial<GuildSettings> = {};

      const warningThreshold = interaction.options.getInteger("warning_threshold");
      if (warningThreshold !== null) updates.warningThreshold = warningThreshold;

      const timeoutThreshold = interaction.options.getInteger("timeout_threshold");
      if (timeoutThreshold !== null) updates.timeoutThreshold = timeoutThreshold;

      const timeoutMinutes = interaction.options.getInteger("timeout_minutes");
      if (timeoutMinutes !== null) updates.defaultTimeoutMinutes = timeoutMinutes;

      const severeTimeoutMinutes = interaction.options.getInteger("severe_timeout_minutes");
      if (severeTimeoutMinutes !== null) updates.severeTimeoutMinutes = severeTimeoutMinutes;

      const aiEnabled = interaction.options.getBoolean("ai_enabled");
      if (aiEnabled !== null) updates.aiEnabled = aiEnabled;

      const logChannel = interaction.options.getChannel("log_channel");
      if (logChannel) updates.logChannelId = logChannel.id;

      const warningChannel = interaction.options.getChannel("warning_channel");
      if (warningChannel) updates.warningChannelId = warningChannel.id;

      const ignoreRole = interaction.options.getRole("ignore_role");
      if (ignoreRole && !settings.ignoredRoles.includes(ignoreRole.id)) {
        updates.ignoredRoles = [...settings.ignoredRoles, ignoreRole.id];
      }

      const ignoreChannel = interaction.options.getChannel("ignore_channel");
      if (ignoreChannel && !settings.ignoredChannels.includes(ignoreChannel.id)) {
        updates.ignoredChannels = [...settings.ignoredChannels, ignoreChannel.id];
      }

      if (Object.keys(updates).length === 0) {
        await interaction.reply({ content: "No settings to update.", ephemeral: true });
        return;
      }

      db.updateGuildSettings(guildId, updates);
      await interaction.reply({ content: "✅ Settings updated.", ephemeral: true });
      break;
    }

    case "user": {
      const target = interaction.options.getUser("target")!;
      const record = db.getUserRecord(target.id, guildId);
      const stateColors: Record<string, number> = {
        normal: 0x2ecc71,
        suspicious: 0xf39c12,
        warned: 0xe67e22,
        repeated: 0xe74c3c,
        timeout: 0xc0392b,
        severe: 0x8e44ad,
      };
      const embed = new EmbedBuilder()
        .setTitle(`🛡️ User Stats: ${target.tag}`)
        .setColor(stateColors[record.state] || 0x95a5a6)
        .addFields(
          { name: "User", value: `${target} (${target.id})`, inline: true },
          { name: "Warnings", value: `${record.warnings}`, inline: true },
          { name: "Timeouts", value: `${record.timeouts}`, inline: true },
          { name: "Spam Incidents", value: `${record.spamIncidents}`, inline: true },
          { name: "Total Spam Score", value: `${record.totalSpamScore}`, inline: true },
          { name: "Violation Severity", value: `${record.violationSeverity}`, inline: true },
          { name: "Current Status", value: record.state.charAt(0).toUpperCase() + record.state.slice(1), inline: true },
          { name: "Last Violation", value: record.lastViolation ? `<t:${Math.floor(record.lastViolation / 1000)}:R>` : "Never", inline: true },
          { name: "Last Warning", value: record.lastWarning ? `<t:${Math.floor(record.lastWarning / 1000)}:R>` : "Never", inline: true }
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "history": {
      const limit = interaction.options.getInteger("limit") || 10;
      const incidents = db.getIncidents(guildId, limit);
      if (incidents.length === 0) {
        await interaction.reply({ content: "No incidents recorded yet.", ephemeral: true });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle("🛡️ Recent Anti-Spam Incidents")
        .setColor(0x3498db);
      for (const inc of incidents) {
        embed.addFields({
          name: `Score ${inc.spamScore} - ${inc.action}`,
          value: `<@${inc.userId}> in <#${inc.channelId}> — ${inc.category}\n<t:${Math.floor(inc.timestamp / 1000)}:R>`,
        });
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "reset": {
      const target = interaction.options.getUser("target")!;
      db.updateUserRecord(target.id, guildId, {
        warnings: 0,
        timeouts: 0,
        spamIncidents: 0,
        lastViolation: null,
        lastWarning: null,
        lastTimeout: null,
        violationSeverity: 0,
        totalSpamScore: 0,
        state: UserState.NORMAL,
      });
      detectorReset(target.id, guildId);
      await interaction.reply({
        content: `✅ Reset spam record for ${target}.`,
        ephemeral: true,
      });
      break;
    }

    case "test": {
      const embed = new EmbedBuilder()
        .setTitle("🛡️ Anti-Spam Test Mode")
        .setColor(0x3498db)
        .setDescription(
          "Test mode simulates spam detection without actually muting users.\n\n" +
            "To test: Send multiple rapid messages in a channel.\n" +
            "The bot will log detection results but will not take action.\n\n" +
            "**Test indicators:**\n" +
            "• Score 0-44: No output\n" +
            "• Score 45-64: Will show detection log\n" +
            "• Score 65+: Will show detection + simulated action"
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case "simulate": {
      if (!detector) {
        await interaction.reply({ content: "Detector not available.", ephemeral: true });
        break;
      }
      const target = interaction.options.getUser("target")!;
      const count = interaction.options.getInteger("count") || 10;
      const message = interaction.options.getString("message") || "gg";

      const settings = db.getGuildSettings(guildId);
      detector.resetProfile(target.id, guildId);

      let finalResult = null;
      for (let i = 0; i < count; i++) {
        finalResult = detector.analyze(target.id, guildId, message, interaction.channelId);
      }

      const embed = new EmbedBuilder()
        .setTitle("🛡️ Spam Simulation")
        .setColor(0x3498db)
        .setDescription(`Simulated ${count}x "${message}" from ${target}`)
        .addFields(
          { name: "Final Score", value: `${finalResult?.score ?? 0}/100`, inline: true },
          { name: "Category", value: finalResult?.category ?? "unknown", inline: true },
          { name: "Would Warn", value: finalResult && finalResult.score >= settings.warningThreshold && finalResult.score < settings.timeoutThreshold ? "YES" : "No", inline: true },
          { name: "Would Timeout", value: finalResult && finalResult.score >= settings.timeoutThreshold ? "YES" : "No", inline: true }
        );

      if (finalResult && finalResult.reasons.length > 0) {
        embed.addFields({ name: "Reasons", value: finalResult.reasons.map((r) => `• ${r}`).join("\n") });
      }

      detector.resetProfile(target.id, guildId);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}
