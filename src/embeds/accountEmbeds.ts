import { EmbedBuilder } from "discord.js";
import {
  AccountCategory,
  AccountRecord,
  InventorySummary,
} from "../types/accounts";

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

function renderBase(account: AccountRecord): string {
  return (
    account.minecraftUuid ||
    encodeURIComponent(account.username)
  );
}

function skinFrontUrl(account: AccountRecord): string {
  return `https://mc-heads.net/body/${renderBase(account)}/left`;
}

function skinBackUrl(account: AccountRecord): string {
  return `https://mc-heads.net/body/${renderBase(account)}/right`;
}

function comboUrl(account: AccountRecord): string {
  return `https://mc-heads.net/combo/${renderBase(account)}/right`;
}

function nameMcUrl(account: AccountRecord): string {
  return `https://namemc.com/profile/${encodeURIComponent(account.username)}`;
}

/**
 * Shared fields for both standard and premium drops.
 * Keeps the embed focused on the essentials: email, password, username, skins, capes.
 */
function buildCoreFields(account: AccountRecord) {
  const meta = account.profileMetadata || {};
  const hasCape = meta.hasCape === true && !!meta.capeUrl;

  return [
    {
      name: "📧 Email",
      value: `\`${account.email || "Not set"}\``,
      inline: true,
    },
    {
      name: "🔑 Password",
      value: `\`${account.password || "Not set"}\``,
      inline: true,
    },
    {
      name: "👤 Username",
      value: `\`${account.username}\``,
      inline: true,
    },
    {
      name: "🧥 Capes",
      value: hasCape
        ? `[Yes — view cape](${meta.capeUrl})`
        : "`None`",
      inline: true,
    },
    {
      name: "🎨 Skins",
      value: `[Skin 1 (front)](${skinFrontUrl(account)}) • [Skin 2 (back)](${skinBackUrl(account)})`,
      inline: true,
    },
    {
      name: "🧬 Model",
      value: `\`${meta.skinType || "Classic (Steve)"}\``,
      inline: true,
    },
  ];
}

/**
 * Standard Account Drop Embed.
 * Rich, linkable embed with account credentials, skin links, and 3D render.
 */
export function createStandardDropEmbed(account: AccountRecord): EmbedBuilder {
  const avatarUrl =
    account.avatarUrl ||
    `https://mc-heads.net/avatar/${encodeURIComponent(account.username)}/128`;

  return new EmbedBuilder()
    .setAuthor({
      name: "🎁 Account Drop System",
      iconURL: avatarUrl,
      url: nameMcUrl(account),
    })
    .setColor(0x0099ff)
    .setTitle(`✅ Account Dropped — ${account.username}`)
    .setURL(nameMcUrl(account))
    .setThumbnail(avatarUrl)
    .setDescription(
      `Your account is ready. Sign in at [minecraft.net](https://www.minecraft.net/login) and change the details right away.\n` +
        `Use [NameMC](${nameMcUrl(account)}) to inspect the skin, capes, and name history.`
    )
    .addFields(buildCoreFields(account))
    .setImage(comboUrl(account)) // Skin 1 + Skin 2 side-by-side 3D render
    .setFooter({
      text: `Ref: ${account.accountRef} • ${formatCategoryName(account.category)}`,
      iconURL: avatarUrl,
    })
    .setTimestamp();
}

/**
 * Premium Account Drop Embed.
 * Same essentials with a luxurious gold theme and exclusive badge.
 */
export function createPremiumDropEmbed(account: AccountRecord): EmbedBuilder {
  const avatarUrl =
    account.avatarUrl ||
    `https://mc-heads.net/avatar/${encodeURIComponent(account.username)}/128`;

  return new EmbedBuilder()
    .setAuthor({
      name: "👑 Premium Golden Drop",
      iconURL: avatarUrl,
      url: nameMcUrl(account),
    })
    .setColor(0xffd700)
    .setTitle(`👑 PREMIUM DROP — ${account.username} ✨`)
    .setURL(nameMcUrl(account))
    .setThumbnail(avatarUrl)
    .setDescription(
      `**Exclusive premium account.** Sign in at [minecraft.net](https://www.minecraft.net/login) and secure it immediately.\n` +
        `Inspect the profile on [NameMC](${nameMcUrl(account)}).`
    )
    .addFields(buildCoreFields(account))
    .setImage(comboUrl(account)) // Skin 1 + Skin 2 side-by-side 3D render
    .setFooter({
      text: `⭐ PREMIUM • Ref: ${account.accountRef} • ${formatCategoryName(account.category)}`,
      iconURL: avatarUrl,
    })
    .setTimestamp();
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
      `No available accounts found for **${catName}**.\n\n` +
        `All accounts of this type have been dropped or none have been added yet.`
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
          `• **Total Standard:** \`${summary.totalStandard}\` (\`${summary.availableStandard}\` avail. / \`${summary.distributedStandard}\` dropped)`,
          `• **Total Premium:** \`${summary.totalPremium}\` (\`${summary.availablePremium}\` avail. / \`${summary.distributedPremium}\` dropped)`,
          `• **Available for Drop:** \`${totalAvailable}\``,
          `• **Already Dropped:** \`${totalDistributed}\``,
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
      text: "Use /accgiver inventory detailed:true to view available accounts.",
    })
    .setTimestamp();
}

/**
 * Detailed Inventory Page Embed.
 * Paginated list of available accounts (email stays masked here).
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
      }-${(page - 1) * 5 + accounts.length} of ${totalItems} available.`
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
      acc.distributionStatus === "available" ? "🟢 Available" : "🔴 Dropped";
    const meta = acc.profileMetadata || {};
    const hasCape = meta.hasCape === true && !!meta.capeUrl;

    embed.addFields({
      name: `${acc.username} [${tierBadge}]`,
      value: [
        `• **Ref:** \`${acc.accountRef}\` • **Status:** ${statusBadge}`,
        `• **Category:** \`${formatCategoryName(acc.category)}\``,
        `• **Capes:** ${hasCape ? `[Yes](${meta.capeUrl})` : "`None`"} • **Model:** \`${meta.skinType || "Classic"}\``,
      ].join("\n"),
      inline: false,
    });
  }

  embed.setFooter({
    text: `Page ${page}/${Math.max(1, totalPages)} • Total: ${totalItems} available accounts`,
  });
  embed.setTimestamp();
  return embed;
}
