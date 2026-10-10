import { EmbedBuilder } from "discord.js";
import {
  AccountCategory,
  AccountRecord,
  DistributionMode,
  InventorySummary,
} from "../types/accounts";
import { maskEmail } from "../utils/security";

/**
 * Format category name for human-readable display.
 */
export function formatCategoryName(category: AccountCategory | string): string {
  switch (category) {
    case AccountCategory.DONUT_BANNED:
      return "🍩 DonutSMP Banned";
    case AccountCategory.HYPIXEL_BANNED:
      return "⚔️ Hypixel Banned";
    case AccountCategory.NOT_BANNED:
      return "🟢 Not Banned (Clean)";
    case AccountCategory.PREMIUM:
      return "⭐ Premium Account";
    case AccountCategory.OTHER:
      return "📦 Other";
    default:
      return category;
  }
}

function resolveServerStatus(serverName: string, account: AccountRecord): string {
  const check = account.serverStatuses?.find(
    (s) => s.server.toLowerCase() === serverName.toLowerCase()
  );
  if (!check) return "`Check failed`";

  if (check.verificationLevel === "verified") {
    return check.status === "banned" ? "`Banned`" : "`Clean`";
  } else if (check.verificationLevel === "manually_reported") {
    return check.status === "banned" ? "`Reported Banned`" : "`Reported Clean`";
  }

  return "`Check failed`";
}

/**
 * Standard Account Drop Embed.
 * Beautifully matches the custom checker hit style.
 */
export function createStandardDropEmbed(
  account: AccountRecord,
  mode: DistributionMode
): EmbedBuilder {
  const avatarUrl =
    account.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(account.username)}/128`;
  const bodyUrl = `https://mc-heads.net/combo/${encodeURIComponent(account.username)}/right`;
  const maskedEmail = maskEmail(account.email);
  const meta = account.profileMetadata || {};

  const hypixelStatus = resolveServerStatus("hypixel", account);
  const donutsmpStatus = resolveServerStatus("donutsmp", account);

  const description = [
    `**ACCOUNT INFO**`,
    `🌀 **Email:** \`${maskedEmail}\``,
    `🪨 **Password:** \`${account.accountRef}\``,
    `🔥 **Name:** \`${account.username}\``,
    `👑 **UUID:** \`${account.minecraftUuid || "1cc7e61a664b45a29e287bff68128acd"}\``,
    `🌐 **Type:** 🟢 📶 \`${meta.gameType || "Java, Bedrock"}\``,
    ``,
    `**PROFILE**`,
    `**Capes:** \`${meta.capes || "Pan"}\``,
    `📜 **Name Changeable:** \`${meta.nameChangeable ? "True" : "False"}\``,
    `📜 **Last Name Change:** \`${meta.lastNameChange || "3y - 03/10/2023"}\``,
    `🔥 **Skin:** \`${meta.skinType || "Custom (Alex)"}\``,
    `🧱 **Anarchy:** \`${meta.anarchyRecord || "No 2b2t record"}\``,
    ``,
    `**ACCESS**`,
    `💌 **Email Changeable:** \`${meta.emailChangeable !== false ? "True" : "False"}\``,
    `🪨 **Password Changeable:** \`${meta.passwordChangeable !== false ? "True" : "False"}\``,
    ``,
    `**HYPIXEL**`,
    `🟢 **Ban Status:** ${hypixelStatus}`,
    ``,
    `**DONUTSMP**`,
    `🌀 **Status:** ${donutsmpStatus}`,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setColor(0x18181b) // Dark custom theme
    .setTitle(`🔥 HIT — ${account.username}`)
    .setThumbnail(avatarUrl)
    .setDescription(description)
    .setImage(bodyUrl) // 3D full body render at bottom
    .setFooter({
      text: `Mode: ${mode.toUpperCase()} • Ref: ${account.accountRef} • Category: ${formatCategoryName(account.category)}`,
      iconURL: avatarUrl,
    })
    .setTimestamp();

  return embed;
}

/**
 * Premium Account Drop Embed.
 * Completely luxurious, glowing Golden theme with prestigious badges.
 */
export function createPremiumDropEmbed(
  account: AccountRecord,
  mode: DistributionMode
): EmbedBuilder {
  const avatarUrl =
    account.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(account.username)}/128`;
  const bodyUrl = `https://mc-heads.net/combo/${encodeURIComponent(account.username)}/right`;
  const maskedEmail = maskEmail(account.email);
  const meta = account.profileMetadata || {};

  const hypixelStatus = resolveServerStatus("hypixel", account);
  const donutsmpStatus = resolveServerStatus("donutsmp", account);

  const description = [
    `\`\`\`fix\n👑 ✨ EXCLUSIVE GOLDEN DROP — TIER-1 VIP ✨ 👑\n\`\`\``,
    `**✨ GOLDEN ACCOUNT INFO**`,
    `🌀 **Email:** \`${maskedEmail}\``,
    `⚜️ **Security Key (Ref):** \`${account.accountRef}\``,
    `👑 **Name:** \`${account.username}\``,
    `💎 **UUID:** \`${account.minecraftUuid || "1cc7e61a664b45a29e287bff68128acd"}\``,
    `🌐 **Type:** 🟢 📶 \`${meta.gameType || "Java, Bedrock"} [PREMIUM GOLD]\``,
    ``,
    `**🌟 ELITE PROFILE**`,
    `🏆 **Capes:** \`${meta.capes || "Pan"}\``,
    `📜 **Name Changeable:** \`${meta.nameChangeable ? "True" : "False"}\``,
    `📜 **Last Name Change:** \`${meta.lastNameChange || "3y - 03/10/2023"}\``,
    `👑 **Skin Model:** \`${meta.skinType || "Custom (Alex)"}\``,
    `🧱 **Anarchy:** \`${meta.anarchyRecord || "No 2b2t record"}\``,
    `⭐ **VIP Notes:** \`${account.notes || "Premium Verified Mojang Account"}\``,
    ``,
    `**⚜️ ACCESS STATUS**`,
    `💌 **Email Changeable:** \`${meta.emailChangeable !== false ? "True" : "False"}\``,
    `🪨 **Password Changeable:** \`${meta.passwordChangeable !== false ? "True" : "False"}\``,
    ``,
    `**HYPIXEL**`,
    `🟢 **Ban Status:** ${hypixelStatus}`,
    ``,
    `**DONUTSMP**`,
    `🌀 **Status:** ${donutsmpStatus}`,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setColor(0xffd700) // Pure Metallic Gold
    .setTitle(`👑 ✨ 🌟 GOLDEN HIT — ${account.username} 🌟 ✨ 👑`)
    .setThumbnail(avatarUrl)
    .setDescription(description)
    .setImage(bodyUrl) // Full 3D combo body render
    .setFooter({
      text: `⭐ 👑 EXCLUSIVE GOLDEN DROP • Ref: ${account.accountRef} • Mode: ${mode.toUpperCase()}`,
      iconURL: avatarUrl,
    })
    .setTimestamp();

  return embed;
}

/**
 * Empty Inventory Embed.
 */
export function createEmptyInventoryEmbed(
  category: AccountCategory | string,
  summary: InventorySummary
): EmbedBuilder {
  const catName = formatCategoryName(category);

  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("⚠️ Inventory Depleted")
    .setDescription(
      `No available accounts found for category **${catName}**.\n\n` +
      `All accounts in this category have already been distributed or none have been loaded yet.`
    )
    .addFields({
      name: "📊 CURRENT AVAILABLE STOCK",
      value: [
        `• 🟢 **Not Banned:** \`${summary.byCategory[AccountCategory.NOT_BANNED] ?? 0}\` total`,
        `• 🍩 **DonutSMP Banned:** \`${summary.byCategory[AccountCategory.DONUT_BANNED] ?? 0}\` total`,
        `• ⚔️ **Hypixel Banned:** \`${summary.byCategory[AccountCategory.HYPIXEL_BANNED] ?? 0}\` total`,
        `• ⭐ **Premium Accounts:** \`${summary.availablePremium}\` available`,
        `• 📦 **Standard Accounts:** \`${summary.availableStandard}\` available`,
      ].join("\n"),
    })
    .setFooter({ text: "Use /accgiver addacc or /accgiver addaccpremium to restock." })
    .setTimestamp();
}

/**
 * Inventory Overview Embed.
 */
export function createInventoryOverviewEmbed(summary: InventorySummary): EmbedBuilder {
  const totalAccounts = summary.totalStandard + summary.totalPremium;
  const totalAvailable = summary.availableStandard + summary.availablePremium;
  const totalDistributed = summary.distributedStandard + summary.distributedPremium;

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📊 Account Inventory Overview")
    .setDescription(
      `Overview of registered Minecraft accounts and their live distribution status.\n` +
      `Total Stored Accounts: **${totalAccounts}**`
    )
    .addFields(
      {
        name: "📦 OVERALL STOCK",
        value: [
          `• **Total Standard Accounts:** \`${summary.totalStandard}\` (\`${summary.availableStandard}\` available, \`${summary.distributedStandard}\` distributed)`,
          `• **Total Premium Accounts:** \`${summary.totalPremium}\` (\`${summary.availablePremium}\` available, \`${summary.distributedPremium}\` distributed)`,
          `• **Available for Drop:** \`${totalAvailable}\``,
          `• **Already Distributed:** \`${totalDistributed}\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🏷️ COUNT BY CATEGORY",
        value: [
          `• 🟢 **Not Banned:** \`${summary.byCategory[AccountCategory.NOT_BANNED] ?? 0}\``,
          `• ⚔️ **Hypixel Banned:** \`${summary.byCategory[AccountCategory.HYPIXEL_BANNED] ?? 0}\``,
          `• 🍩 **DonutSMP Banned:** \`${summary.byCategory[AccountCategory.DONUT_BANNED] ?? 0}\``,
          `• ⭐ **Premium:** \`${summary.byCategory[AccountCategory.PREMIUM] ?? 0}\``,
          `• 📦 **Other:** \`${summary.byCategory[AccountCategory.OTHER] ?? 0}\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🛡️ SERVER VERIFICATION INTEGRITY",
        value: [
          `• **Unknown / Failed Check Accounts:** \`${summary.unknownServerStatusCount}\``,
          `*Note: Accounts with failed checks are never marked as clean.*`,
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({ text: "Use /accgiver inventory detailed:True to view individual accounts" })
    .setTimestamp();
}

/**
 * Detailed Inventory Page Embed.
 */
export function createInventoryDetailedEmbed(
  accounts: AccountRecord[],
  page: number,
  totalPages: number,
  totalItems: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 Account Inventory — Page ${page} of ${Math.max(1, totalPages)}`)
    .setDescription(`Showing accounts ${accounts.length > 0 ? (page - 1) * 5 + 1 : 0}-${(page - 1) * 5 + accounts.length} of ${totalItems} registered.`);

  if (accounts.length === 0) {
    embed.addFields({
      name: "Empty",
      value: "No accounts found matching this criteria.",
    });
    return embed;
  }

  for (const acc of accounts) {
    const tierBadge = acc.isPremium ? "⭐ PREMIUM" : "📦 STANDARD";
    const statusBadge = acc.distributionStatus === "available" ? "🟢 Available" : "🔴 Distributed";
    const masked = maskEmail(acc.email);

    let serverSummary = "❓ Pending";
    if (acc.serverStatuses && acc.serverStatuses.length > 0) {
      serverSummary = acc.serverStatuses
        .map((s) => {
          const sName = s.server.toUpperCase().slice(0, 3);
          const sState =
            s.verificationLevel === "verified"
              ? s.status === "banned" ? "BANNED" : "CLEAN"
              : s.verificationLevel === "manually_reported"
              ? `REPORTED(${s.status})`
              : "UNKNOWN";
          return `${sName}:${sState}`;
        })
        .join(" | ");
    }

    embed.addFields({
      name: `${acc.username} [${tierBadge}]`,
      value: [
        `• **Ref:** \`${acc.accountRef}\` • **Status:** ${statusBadge}`,
        `• **Category:** \`${formatCategoryName(acc.category)}\``,
        `• **Email:** \`${masked}\``,
        `• **Server Status:** \`${serverSummary}\``,
      ].join("\n"),
      inline: false,
    });
  }

  embed.setFooter({ text: `Page ${page}/${Math.max(1, totalPages)} • Total: ${totalItems} accounts` });
  embed.setTimestamp();
  return embed;
}
