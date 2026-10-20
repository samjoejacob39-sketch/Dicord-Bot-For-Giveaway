import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import {
  AccountCategory,
  AccountRecord,
  InventorySummary,
} from "../types/accounts";

const MINECRAFT_LOGIN_URL = "https://www.minecraft.net/login";
const MC_HEADS_BASE = "https://mc-heads.net";

export interface DropEmbedOptions {
  /** Server name used for the branded author line. */
  guildName?: string;
  /** Server icon used for the branded author icon. */
  guildIconUrl?: string;
  /** Discord user ID of the admin delivering the account. */
  deliveredBy?: string;
  /** Discord user ID of the customer receiving the account. */
  recipientId?: string;
  /** Delivery timestamp (defaults to now). */
  deliveredAt?: number;
  /** "drop" shows delivery details, "preview" is used by the add command. */
  mode?: "drop" | "preview";
}

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
  return account.minecraftUuid || encodeURIComponent(account.username);
}

function comboUrl(account: AccountRecord): string {
  return `${MC_HEADS_BASE}/combo/${renderBase(account)}/right`;
}

function skinRenderUrl(account: AccountRecord): string {
  return `${MC_HEADS_BASE}/body/${renderBase(account)}/right`;
}

function nameMcUrl(account: AccountRecord): string {
  return `https://namemc.com/profile/${encodeURIComponent(account.username)}`;
}

function avatarUrl(account: AccountRecord, size = 256): string {
  return (
    account.avatarUrl?.replace(/\/\d+$/, `/${size}`) ||
    `${MC_HEADS_BASE}/avatar/${renderBase(account)}/${size}`
  );
}

function capeRenderUrl(account: AccountRecord): string | undefined {
  const meta = account.profileMetadata || {};
  if (meta.hasCape !== true || !meta.capeUrl) return undefined;
  // Crafatar supports upscaled cape renders for sharper images.
  if (meta.capeUrl.includes("crafatar.com/capes/") && !meta.capeUrl.includes("?")) {
    return `${meta.capeUrl}?scale=10`;
  }
  return meta.capeUrl;
}

/** Prevents credentials from breaking out of the fenced code block. */
function codeSafe(value: string | undefined): string {
  return (value || "Not set").replace(/`/g, "'").replace(/\r?\n/g, " ");
}

/**
 * Discord only makes the embed *title* and *author name* clickable.
 * Everything else is exposed through masked links and link buttons.
 */
export function buildEmbedLinks(account: AccountRecord) {
  const cape = capeRenderUrl(account);

  return {
    nameMc: nameMcUrl(account),
    skin: skinRenderUrl(account),
    cape,
    login: MINECRAFT_LOGIN_URL,
  };
}

/**
 * Link buttons shown under drop embeds.
 * Link buttons are the only reliable way to add multiple clickable
 * actions to an embed (max 5 per row).
 */
export function createDropActionRow(
  account: AccountRecord
): ActionRowBuilder<ButtonBuilder> {
  const links = buildEmbedLinks(account);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("NameMC Profile")
      .setEmoji("🧑")
      .setStyle(ButtonStyle.Link)
      .setURL(links.nameMc),
    new ButtonBuilder()
      .setLabel("3D Skin")
      .setEmoji("🎨")
      .setStyle(ButtonStyle.Link)
      .setURL(links.skin)
  );

  if (links.cape) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("Cape")
        .setEmoji("🧥")
        .setStyle(ButtonStyle.Link)
        .setURL(links.cape)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setLabel("Minecraft Login")
      .setEmoji("🔑")
      .setStyle(ButtonStyle.Link)
      .setURL(links.login)
  );

  return row;
}

/**
 * Customer-friendly fields: capes, skin model, delivery receipt and quick links.
 * Credentials live in a copy-friendly code block inside the description.
 */
function buildCoreFields(
  account: AccountRecord,
  options: DropEmbedOptions
): Array<{ name: string; value: string; inline: boolean }> {
  const meta = account.profileMetadata || {};
  const cape = capeRenderUrl(account);
  const isPreview = options.mode === "preview";
  const deliveredAt = options.deliveredAt ?? Date.now();

  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    {
      name: "🧥 Capes",
      value: cape ? `[Yes — view cape](${cape})` : "`None`",
      inline: true,
    },
    {
      name: "🧬 Model",
      value: `\`${meta.skinType || "Classic (Steve)"}\``,
      inline: true,
    },
    {
      name: "📦 Type",
      value: `\`${formatCategoryName(account.category)}\``,
      inline: true,
    },
  ];

  if (!isPreview) {
    fields.push({
      name: "🧾 Delivery Receipt",
      value: `👤 ${
        options.deliveredBy ? `<@${options.deliveredBy}>` : "Staff"
      } • 🕒 <t:${Math.floor(deliveredAt / 1000)}:R>`,
      inline: false,
    });
  }

  fields.push({
    name: "🔗 Quick Links",
    value: [
      `[NameMC Profile](${nameMcUrl(account)})`,
      `[3D Skin Render](${skinRenderUrl(account)})`,
      cape ? `[Cape Render](${cape})` : null,
      `[Minecraft Login](${MINECRAFT_LOGIN_URL})`,
    ]
      .filter(Boolean)
      .join(" • "),
    inline: false,
  });

  return fields;
}

function buildCredentialBlock(account: AccountRecord): string {
  return [
    "```txt",
    `Email:    ${codeSafe(account.email)}`,
    `Password: ${codeSafe(account.password)}`,
    `Username: ${codeSafe(account.username)}`,
    "```",
  ].join("\n");
}

function buildDescription(
  account: AccountRecord,
  options: DropEmbedOptions
): string {
  const isPreview = options.mode === "preview";
  const isPremium = account.isPremium;

  const greeting = isPreview
    ? "📦 **Account preview** — this is how the account will look when dropped."
    : options.recipientId
      ? `🎉 <@${options.recipientId}>, **your Minecraft account is ready!**`
      : "🎉 **Your Minecraft account is ready!**";

  const intro = isPremium
    ? "**Premium account** — sign in at [minecraft.net](https://www.minecraft.net/login) and secure it immediately."
    : "Sign in at [minecraft.net](https://www.minecraft.net/login) and secure it right away.";

  return [
    greeting,
    intro,
    "",
    buildCredentialBlock(account),
    "",
    "🔐 **Next steps:** Change password → Change email → Enable 2FA",
  ].join("\n");
}

function buildBrandAuthor(account: AccountRecord, options: DropEmbedOptions) {
  const icon = options.guildIconUrl || avatarUrl(account, 128);
  const name = account.isPremium
    ? options.guildName
      ? `👑 ${options.guildName} Premium`
      : "👑 Premium Delivery"
    : options.guildName
      ? `🎁 ${options.guildName} Deliveries`
      : "🎁 Account Delivery";

  return {
    name,
    iconURL: icon,
    url: nameMcUrl(account),
  };
}

/**
 * Standard Account Drop Embed.
 * Rich, linkable embed with a copy-ready credential block, delivery receipt,
 * skin links and a 3D render.
 */
export function createStandardDropEmbed(
  account: AccountRecord,
  options: DropEmbedOptions = {}
): EmbedBuilder {
  const isPreview = options.mode === "preview";
  const avatar = avatarUrl(account);

  return new EmbedBuilder()
    .setAuthor(buildBrandAuthor(account, options))
    .setColor(0x0099ff)
    .setTitle(
      isPreview
        ? `✅ Account Registered — ${account.username}`
        : `✅ Account Delivered — ${account.username}`
    )
    .setURL(nameMcUrl(account))
    .setThumbnail(avatar)
    .setDescription(buildDescription(account, options))
    .addFields(buildCoreFields(account, options))
    .setImage(comboUrl(account))
    .setFooter({
      text: isPreview
        ? `Preview • Ref: ${account.accountRef} • ${formatCategoryName(account.category)}`
        : `✅ Delivered • Ref: ${account.accountRef} • ${formatCategoryName(account.category)}`,
      iconURL: options.guildIconUrl || avatar,
    })
    .setTimestamp(options.deliveredAt ?? Date.now());
}

/**
 * Premium Account Drop Embed.
 * Same essentials with a luxurious gold theme and exclusive badge.
 */
export function createPremiumDropEmbed(
  account: AccountRecord,
  options: DropEmbedOptions = {}
): EmbedBuilder {
  const isPreview = options.mode === "preview";
  const avatar = avatarUrl(account);

  return new EmbedBuilder()
    .setAuthor(buildBrandAuthor(account, options))
    .setColor(0xffd700)
    .setTitle(
      isPreview
        ? `👑 PREMIUM ACCOUNT — ${account.username} ✨`
        : `👑 PREMIUM DELIVERED — ${account.username} ✨`
    )
    .setURL(nameMcUrl(account))
    .setThumbnail(avatar)
    .setDescription(buildDescription(account, options))
    .addFields(buildCoreFields(account, options))
    .setImage(comboUrl(account))
    .setFooter({
      text: isPreview
        ? `Preview • Ref: ${account.accountRef} • ${formatCategoryName(account.category)}`
        : `⭐ Premium • ✅ Delivered • Ref: ${account.accountRef}`,
      iconURL: options.guildIconUrl || avatar,
    })
    .setTimestamp(options.deliveredAt ?? Date.now());
}

/**
 * Optional second card that shows the account's cape render.
 * Returns null when the account does not own a cape.
 */
export function createCapeShowcaseEmbed(
  account: AccountRecord
): EmbedBuilder | null {
  const cape = capeRenderUrl(account);
  if (!cape) return null;

  return new EmbedBuilder()
    .setColor(account.isPremium ? 0xffd700 : 0x0099ff)
    .setTitle(`🧥 Cape Showcase — ${account.username}`)
    .setURL(nameMcUrl(account))
    .setDescription(
      `This account owns a cape. [View the full profile on NameMC](${nameMcUrl(account)}).`
    )
    .setImage(cape)
    .setFooter({ text: `Ref: ${account.accountRef} • Cape render via Crafatar` });
}

/**
 * Builds the full drop message payload: main card + optional cape card.
 */
export function createDropEmbeds(
  account: AccountRecord,
  options: DropEmbedOptions = {}
): EmbedBuilder[] {
  const main = account.isPremium
    ? createPremiumDropEmbed(account, options)
    : createStandardDropEmbed(account, options);

  if (options.mode === "preview") return [main];

  const cape = createCapeShowcaseEmbed(account);
  return cape ? [main, cape] : [main];
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
    const cape = capeRenderUrl(acc);

    embed.addFields({
      name: `${acc.username} [${tierBadge}]`,
      value: [
        `• **Ref:** \`${acc.accountRef}\` • **Status:** ${statusBadge}`,
        `• **Category:** \`${formatCategoryName(acc.category)}\``,
        `• **Capes:** ${cape ? `[Yes](${cape})` : "`None`"} • **Model:** \`${meta.skinType || "Classic"}\``,
        `• **Links:** [NameMC](https://namemc.com/profile/${encodeURIComponent(acc.username)}) • [3D Skin](${skinRenderUrl(acc)})`,
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
