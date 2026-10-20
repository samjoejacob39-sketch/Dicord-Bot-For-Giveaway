import { EmbedBuilder } from "discord.js";
import {
  AccountCategory,
  AccountRecord,
  InventorySummary,
} from "../types/accounts";
import { maskEmail } from "../utils/security";

/**
 * Format category name for human-readable display.
 */
export function formatCategoryName(category: AccountCategory | string): string {
  switch (category) {
    case AccountCategory.NOT_BANNED:
      return "🟢 Standard (Clean)";
    case AccountCategory.PREMIUM:
      return "⭐ Premium";
    default:
      return String(category);
  }
}

/**
 * Standard Account Drop Embed.
 * Clean, modern dark design with well-organized inline fields.
 */
export function createStandardDropEmbed(account: AccountRecord): EmbedBuilder {
  const avatarUrl =
    account.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(account.username)}/128`;
  const bodyUrl = `https://mc-heads.net/combo/${encodeURIComponent(account.username)}/right`;
  const maskedEmail = maskEmail(account.email);
  const meta = account.profileMetadata || {};

  const embed = new EmbedBuilder()
    .setAuthor({ name: "🎁 Account Drop System" })
    .setColor(0x2c2f33) // Clean dark theme
    .setTitle(`✅ Account Dropped — ${account.username}`)
    .setThumbnail(avatarUrl)
    .setImage(bodyUrl) // 3D full-body render at bottom
    .addFields(
      {
        name: "📋 Account Info",
        value: [
          `**Name:** \`${account.username}\``,
          `**Ref:** \`${account.accountRef}\``,
          `**UUID:** \`${account.minecraftUuid || "Unknown"}\``,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🔐 Access",
        value: [
          `**Email:** \`${maskedEmail}\``,
          `**Email Changeable:** \`${meta.emailChangeable !== false ? "Yes" : "No"}\``,
          `**Password Changeable:** \`${meta.passwordChangeable !== false ? "Yes" : "No"}\``,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🎨 Profile",
        value: [
          `**Capes:** \`${meta.capes || "None"}\``,
          `**Skin:** \`${meta.skinType || "Custom (Alex)"}\``,
          `**Name Changeable:** \`${meta.nameChangeable ? "Yes" : "No"}\``,
        ].join("\n"),
        inline: true,
      }
    )
    .setFooter({
      text: `Ref: ${account.accountRef} • Category: ${formatCategoryName(account.category)}`,
      iconURL: avatarUrl,
    })
    .setTimestamp();

  return embed;
}

/**
 * Premium Account Drop Embed.
 * Luxurious golden theme with prestigious badges and a bigger profile section.
 */
export function createPremiumDropEmbed(account: AccountRecord): EmbedBuilder {
  const avatarUrl =
    account.avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(account.username)}/128`;
  const bodyUrl = `https://mc-heads.net/combo/${encodeURIComponent(account.username)}/right`;
  const maskedEmail = maskEmail(account.email);
  const meta = account.profileMetadata || {};

  const embed = new EmbedBuilder()
    .setAuthor({ name: "👑 Premium Golden Drop System" })
    .setColor(0xffd700) // Pure Metallic Gold
    .setTitle(`👑 ✨ PREMIUM GOLDEN DROP — ${account.username} ✨ 👑`)
    .setThumbnail(avatarUrl)
    .setImage(bodyUrl) // High-res 3D combo body render
    .addFields(
      {
        name: "✨ Premium Account Info",
        value: [
          `**Name:** \`${account.username}\``,
          `**Security Ref:** \`${account.accountRef}\``,
          `**UUID:** \`${account.minecraftUuid || "Unknown"}\``,
          `**VIP Notes:** \`${account.notes || "Premium Verified Mojang Account"}\``,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🔐 Access",
        value: [
          `**Email:** \`${maskedEmail}\``,
          `**Email Changeable:** \`${meta.emailChangeable !== false ? "Yes" : "No"}\``,
          `**Password Changeable:** \`${meta.passwordChangeable !== false ? "Yes" : "No"}\``,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🎨 Elite Profile",
        value: [
          `**Capes:** \`${meta.capes || "Pan Cape"}\``,
          `**Skin Model:** \`${meta.skinType || "Custom (Alex)"}\``,
          `**Name Changeable:** \`${meta.nameChangeable ? "Yes" : "No"}\``,
          `**Last Name Change:** \`${meta.lastNameChange || "Unknown"}\``,
        ].join("\n"),
        inline: true,
      }
    )
    .setFooter({
      text: `⭐ 👑 EXCLUSIVE GOLDEN DROP • Ref: ${account.accountRef}`,
      iconURL: avatarUrl,
    })
    .setTimestamp();

  return embed;
}

/**
 * Empty Inventory Embed.
 * Shows which category is depleted and what stock remains elsewhere.
 */
export function createEmptyInventoryEmbed(
  category: AccountCategory | string,
  summary: InventorySummary
): EmbedBuilder {
  const catName = formatCategoryName(category);

  return new EmbedBuilder()
    .setAuthor({ name: "🎁 Account Drop System" })
    .setColor(0xed4245)
    .setTitle("⚠️ Inventory Depleted")
    .setDescription(
      `No available accounts found for category **${catName}**.\n\n` +
        `All accounts in this category have already been distributed or none have been loaded yet.`
    )
    .addFields({
      name: "📊 Current Available Stock",
      value: [
        `• 🟢 **Standard:** \`${summary.availableStandard}\` available`,
        `• ⭐ **Premium:** \`${summary.availablePremium}\` available`,
      ].join("\n"),
    })
    .setFooter({
      text: "Use /accgiver addacc or /accgiver addaccpremium to restock.",
    })
    .setTimestamp();
}

/**
 * Inventory Overview Embed.
 * High-level stock statistics with a clean breakdown.
 */
export function createInventoryOverviewEmbed(summary: InventorySummary): EmbedBuilder {
  const totalAccounts = summary.totalStandard + summary.totalPremium;
  const totalAvailable = summary.availableStandard + summary.availablePremium;
  const totalDistributed = summary.distributedStandard + summary.distributedPremium;

  return new EmbedBuilder()
    .setAuthor({ name: "🎁 Account Drop System" })
    .setColor(0x5865f2)
    .setTitle("📊 Account Inventory Overview")
    .setDescription(
      `Live overview of registered Minecraft accounts and their distribution status.\n` +
        `Total Stored Accounts: **${totalAccounts}**`
    )
    .addFields(
      {
        name: "📦 Overall Stock",
        value: [
          `• **Total Standard:** \`${summary.totalStandard}\` (\`${summary.availableStandard}\` avail. / \`${summary.distributedStandard}\` dist.)`,
          `• **Total Premium:** \`${summary.totalPremium}\` (\`${summary.availablePremium}\` avail. / \`${summary.distributedPremium}\` dist.)`,
          `• **Available for Drop:** \`${totalAvailable}\``,
          `• **Already Distributed:** \`${totalDistributed}\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🏷️ Count by Category",
        value: [
          `• 🟢 **Standard:** \`${summary.byCategory[AccountCategory.NOT_BANNED] ?? 0}\``,
          `• ⭐ **Premium:** \`${summary.byCategory[AccountCategory.PREMIUM] ?? 0}\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🛡️ Server Verification Integrity",
        value: [
          `• **Unknown / Failed Check Accounts:** \`${summary.unknownServerStatusCount}\``,
          `*Accounts with failed checks are never marked as clean.*`,
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({
      text: "Use /accgiver inventory detailed:true to view individual accounts.",
    })
    .setTimestamp();
}

/**
 * Detailed Inventory Page Embed.
 * Paginated list of individual accounts.
 */
export function createInventoryDetailedEmbed(
  accounts: AccountRecord[],
  page: number,
  totalPages: number,
  totalItems: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setAuthor({ name: "🎁 Account Drop System" })
    .setColor(0x5865f2)
    .setTitle(
      `📋 Account Inventory — Page ${page} of ${Math.max(1, totalPages)}`
    )
    .setDescription(
      `Showing accounts ${
        accounts.length > 0 ? (page - 1) * 5 + 1 : 0
      }-${(page - 1) * 5 + accounts.length} of ${totalItems} registered.`
    );

  if (accounts.length === 0) {
    embed.addFields({
      name: "Empty",
      value: "No accounts found matching this criteria.",
    });
    return embed;
  }

  for (const acc of accounts) {
    const tierBadge = acc.isPremium ? "⭐ PREMIUM" : "📦 STANDARD";
    const statusBadge =
      acc.distributionStatus === "available" ? "🟢 Available" : "🔴 Distributed";
    const masked = maskEmail(acc.email);

    embed.addFields({
      name: `${acc.username} [${tierBadge}]`,
      value: [
        `• **Ref:** \`${acc.accountRef}\` • **Status:** ${statusBadge}`,
        `• **Category:** \`${formatCategoryName(acc.category)}\``,
        `• **Email:** \`${masked}\``,
      ].join("\n"),
      inline: false,
    });
  }

  embed.setFooter({
    text: `Page ${page}/${Math.max(1, totalPages)} • Total: ${totalItems} accounts`,
  });
  embed.setTimestamp();
  return embed;
}
