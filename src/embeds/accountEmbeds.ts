import { EmbedBuilder } from "discord.js";
import {
  AccountCategory,
  AccountRecord,
  DistributionMode,
  InventorySummary,
} from "../types/accounts";
import { formatServerStatusesForEmbed, maskEmail } from "../utils/security";

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

/**
 * Standard Account Drop Embed.
 * Design: Clean dark embed with clear section headings and Minecraft avatar.
 */
export function createStandardDropEmbed(
  account: AccountRecord,
  mode: DistributionMode
): EmbedBuilder {
  const avatarUrl =
    account.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(account.username)}/128`;
  const maskedEmail = maskEmail(account.email);
  const serverStatusFormatted = formatServerStatusesForEmbed(account.serverStatuses);
  const dateAddedSeconds = Math.floor(account.createdAt / 1000);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31) // Clean dark embed color
    .setTitle(`📦 Account Drop — ${account.username}`)
    .setThumbnail(avatarUrl)
    .setDescription(
      `An eligible account in category **${formatCategoryName(account.category)}** has been dropped.`
    )
    .addFields(
      {
        name: "👤 ACCOUNT INFO",
        value: [
          `• **Username:** \`${account.username}\``,
          `• **Masked Email:** \`${maskedEmail}\``,
          `• **Category:** \`${formatCategoryName(account.category)}\``,
          `• **UUID:** \`${account.minecraftUuid || "Not Registered / Unresolved"}\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🛡️ VERIFIED SERVER STATUS",
        value: serverStatusFormatted,
        inline: false,
      },
      {
        name: "📋 DROP DETAILS",
        value: [
          `• **Account Reference:** \`${account.accountRef}\``,
          `• **Distribution Mode:** \`${mode.toUpperCase()}\``,
          `• **Date Added:** <t:${dateAddedSeconds}:f> (<t:${dateAddedSeconds}:R>)`,
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({
      text: `Ref: ${account.accountRef} • Secure Drop System • Mode: ${mode}`,
      iconURL: avatarUrl,
    })
    .setTimestamp();

  return embed;
}

/**
 * Premium Account Drop Embed.
 * Design: Special gold-themed embed with gold accent, premium title, elegant formatting, larger avatar.
 */
export function createPremiumDropEmbed(
  account: AccountRecord,
  mode: DistributionMode
): EmbedBuilder {
  const avatarUrl =
    account.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(account.username)}/128`;
  const bodyUrl = `https://mc-heads.net/body/${encodeURIComponent(account.username)}/right`;
  const maskedEmail = maskEmail(account.email);
  const serverStatusFormatted = formatServerStatusesForEmbed(account.serverStatuses);
  const dateAddedSeconds = Math.floor(account.createdAt / 1000);

  const embed = new EmbedBuilder()
    .setColor(0xd4af37) // Metallic Gold Accent
    .setTitle("✨ 👑 PREMIUM MINECRAFT ACCOUNT DROP 👑 ✨")
    .setThumbnail(avatarUrl)
    .setImage(bodyUrl) // Larger avatar / full 3D body render
    .setDescription(
      `**👑 PREMIUM TIER DROP**\n` +
      `This profile has been verified under the Premium Account tier.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      {
        name: "🌟 PREMIUM DESIGNATION",
        value: [
          `• **Tier:** \`⭐ Tier-1 Premium Profile\``,
          `• **Security Reference:** \`${account.accountRef}\``,
          `• **Status:** \`${account.distributionStatus === "available" ? "🟢 Active Profile" : "📦 Distributed"}\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "👤 ACCOUNT INFORMATION",
        value: [
          `• **Username:** \`${account.username}\``,
          `• **Masked Email:** \`${maskedEmail}\``,
          `• **Minecraft UUID:** \`${account.minecraftUuid || "Resolved On-Chain"}\``,
          `• **Category:** \`${formatCategoryName(account.category)}\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📜 PROFILE INFORMATION",
        value: [
          `• **Notes & Profile Metadata:** \`${account.notes || "Standard Premium Mojang Profile"}\``,
          `• **Distribution Mode:** \`${mode.toUpperCase()}\``,
          `• **Registered At:** <t:${dateAddedSeconds}:f> (<t:${dateAddedSeconds}:R>)`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🛡️ VERIFIED SERVER STATUS",
        value: serverStatusFormatted,
        inline: false,
      }
    )
    .setFooter({
      text: `⭐ Premium Drop System • Ref: ${account.accountRef} • Authorized Claim`,
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
    .setColor(0xed4245) // Discord Red / Alert
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
    .setColor(0x5865f2) // Discord Blurple
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
