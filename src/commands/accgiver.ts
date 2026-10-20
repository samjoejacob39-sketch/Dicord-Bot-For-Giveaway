import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import {
  AccountCategory,
  AccountRecord,
  DatabaseService,
  DistributionMode,
  ServerCheckStatus,
} from "../types";
import {
  createEmptyInventoryEmbed,
  createInventoryDetailedEmbed,
  createInventoryOverviewEmbed,
  createPremiumDropEmbed,
  createStandardDropEmbed,
  formatCategoryName,
} from "../embeds/accountEmbeds";
import { resolveMinecraftProfile } from "../services/minecraft";
import {
  containsDisallowedSecrets,
  generateAccountRef,
  generateId,
  isUserAuthorized,
  isValidCategory,
  maskEmail,
} from "../utils/security";
import { logger } from "../utils/logger";

export const accgiverCommand = new SlashCommandBuilder()
  .setName("accgiver")
  .setDescription("Account Drop System & Inventory Management")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  // 1. Add standard account
  .addSubcommand((sub) =>
    sub
      .setName("addacc")
      .setDescription("Add a standard Minecraft account to inventory")
      .addStringOption((opt) =>
        opt
          .setName("username")
          .setDescription("Minecraft username")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("email")
          .setDescription("Associated email address (masked in public embeds)")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("category")
          .setDescription("Account category")
          .setRequired(true)
          .addChoices(
            { name: "Not Banned (Clean)", value: AccountCategory.NOT_BANNED },
            { name: "Other", value: AccountCategory.OTHER }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("notes")
          .setDescription("Profile metadata (capes, ranks - NO PASSWORDS)")
          .setRequired(false)
      )
  )

  // 2. Add premium account
  .addSubcommand((sub) =>
    sub
      .setName("addaccpremium")
      .setDescription("Add a premium Minecraft account to inventory")
      .addStringOption((opt) =>
        opt
          .setName("username")
          .setDescription("Minecraft username")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("email")
          .setDescription("Associated email address (masked in public embeds)")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("category")
          .setDescription("Category (defaults to premium)")
          .setRequired(false)
          .addChoices(
            { name: "Premium", value: AccountCategory.PREMIUM },
            { name: "Not Banned (Clean)", value: AccountCategory.NOT_BANNED },
            { name: "Other", value: AccountCategory.OTHER }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("notes")
          .setDescription("Profile metadata (capes, ranks - NO PASSWORDS)")
          .setRequired(false)
      )
  )

  // 3. Drop account by category (including drop category:premium)
  .addSubcommand((sub) =>
    sub
      .setName("drop")
      .setDescription("Drop an eligible account by category")
      .addStringOption((opt) =>
        opt
          .setName("category")
          .setDescription("Account category to drop")
          .setRequired(true)
          .addChoices(
            { name: "Premium Account", value: AccountCategory.PREMIUM },
            { name: "Not Banned (Clean)", value: AccountCategory.NOT_BANNED },
            { name: "Other", value: AccountCategory.OTHER }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("Distribution mode (default: one_time)")
          .setRequired(false)
          .addChoices(
            { name: "One-Time Claim (Consumed)", value: "one_time" },
            { name: "Reusable Profile Display", value: "reusable" },
            { name: "Administrator Preview", value: "preview" }
          )
      )
  )

  // 4. Inventory Overview & List
  .addSubcommand((sub) =>
    sub
      .setName("inventory")
      .setDescription("View account inventory stock and counts")
      .addIntegerOption((opt) =>
        opt
          .setName("page")
          .setDescription("Page number for detailed inventory")
          .setMinValue(1)
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("category")
          .setDescription("Filter inventory by category")
          .setRequired(false)
          .addChoices(
            { name: "All Categories", value: "all" },
            { name: "Premium", value: AccountCategory.PREMIUM },
            { name: "Not Banned", value: AccountCategory.NOT_BANNED },
            { name: "Other", value: AccountCategory.OTHER }
          )
      )
      .addBooleanOption((opt) =>
        opt
          .setName("detailed")
          .setDescription("Show individual account list with pagination")
          .setRequired(false)
      )
  )

  // 5. Change account category
  .addSubcommand((sub) =>
    sub
      .setName("setcategory")
      .setDescription("Change category for an existing account")
      .addStringOption((opt) =>
        opt
          .setName("username")
          .setDescription("Minecraft username")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("category")
          .setDescription("New category")
          .setRequired(true)
          .addChoices(
            { name: "Premium", value: AccountCategory.PREMIUM },
            { name: "Not Banned", value: AccountCategory.NOT_BANNED },
            { name: "Other", value: AccountCategory.OTHER }
          )
      )
  )

  // 6. Delete account
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Delete an account from inventory")
      .addStringOption((opt) =>
        opt
          .setName("username")
          .setDescription("Minecraft username")
          .setRequired(true)
      )
  );

export async function handleAccgiverCommand(
  interaction: ChatInputCommandInteraction,
  db: DatabaseService
): Promise<void> {
  // Authorization check for all admin & drop operations
  if (!isUserAuthorized(interaction)) {
    await interaction.reply({
      content:
        "❌ **Access Denied:** Only the bot owner and authorized administrators have permission to manage accounts or trigger drops.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "addacc":
      await handleAddAccount(interaction, db, false);
      break;
    case "addaccpremium":
      await handleAddAccount(interaction, db, true);
      break;
    case "drop":
      await handleDrop(interaction, db);
      break;
    case "inventory":
      await handleInventory(interaction, db);
      break;
    case "setcategory":
      await handleSetCategory(interaction, db);
      break;
    case "delete":
      await handleDelete(interaction, db);
      break;
    default:
      await interaction.reply({
        content: `Unknown subcommand: ${subcommand}`,
        ephemeral: true,
      });
  }
}

/**
 * Handle Add Account (both standard and premium).
 */
async function handleAddAccount(
  interaction: ChatInputCommandInteraction,
  db: DatabaseService,
  isPremium: boolean
): Promise<void> {
  const username = interaction.options.getString("username", true).trim();
  const email = interaction.options.getString("email", true).trim();
  const categoryStr =
    interaction.options.getString("category") ||
    (isPremium ? AccountCategory.PREMIUM : AccountCategory.OTHER);
  const notes = interaction.options.getString("notes")?.trim();

  // Security check: passwords/secrets must NEVER be accepted
  if (containsDisallowedSecrets(notes) || containsDisallowedSecrets(email)) {
    await interaction.reply({
      content:
        "❌ **Security Violation:** Do not submit raw passwords, tokens, or credentials through Discord commands. Use account references only.",
      ephemeral: true,
    });
    return;
  }

  // Validate category
  if (!isValidCategory(categoryStr)) {
    await interaction.reply({
      content: `❌ Invalid category: \`${categoryStr}\`.`,
      ephemeral: true,
    });
    return;
  }
  const category = categoryStr as AccountCategory;

  // Check duplicate
  const existing = db.getAccountByUsername(username);
  if (existing) {
    await interaction.reply({
      content: `❌ **Duplicate Account:** Account \`${username}\` is already registered in inventory.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Resolve complete Minecraft profile in the backend automatically
  const profile = await resolveMinecraftProfile(username);
  const accountRef = generateAccountRef(isPremium);
  const now = Date.now();

  // No external server checks (Hypixel/DonutSMP removed) — start with empty statuses
  const serverStatuses: ServerCheckStatus[] = [];

  const newAccount: AccountRecord = {
    id: generateId(),
    username: profile.username || username,
    email,
    category,
    isPremium,
    accountRef,
    minecraftUuid: profile.uuid,
    avatarUrl: profile.avatarUrl,
    notes: notes || undefined,
    distributionStatus: "available",
    serverStatuses,
    profileMetadata: {
      skinType: profile.skinType,
      capes: notes && notes.toLowerCase().includes("cape") ? notes : profile.capes,
      nameChangeable: profile.nameChangeable,
      lastNameChange: profile.lastNameChange,
      anarchyRecord: profile.anarchyRecord,
      emailChangeable: profile.emailChangeable,
      passwordChangeable: profile.passwordChangeable,
      gameType: profile.gameType,
    },
    addedBy: interaction.user.id,
    createdAt: now,
    updatedAt: now,
  };

  try {
    db.addAccount(newAccount);

    const embed = isPremium
      ? createPremiumDropEmbed(newAccount, "preview")
      : createStandardDropEmbed(newAccount, "preview");

    await interaction.editReply({
      content: `✅ **${isPremium ? "Premium Golden" : "Standard"} Account Registered Successfully!** Here is the preview:`,
      embeds: [embed],
    });
  } catch (err: any) {
    logger.error("Failed to add account:", err);
    await interaction.editReply({
      content: `❌ Failed to add account: ${err.message || err}`,
    });
  }
}

/**
 * Handle Drop Subcommand.
 */
async function handleDrop(
  interaction: ChatInputCommandInteraction,
  db: DatabaseService
): Promise<void> {
  const categoryStr = interaction.options.getString("category", true);
  const modeStr = (interaction.options.getString("mode") || "one_time") as DistributionMode;

  // 1. Validate category
  if (!isValidCategory(categoryStr)) {
    await interaction.reply({
      content: `❌ Invalid category specified: \`${categoryStr}\`.`,
      ephemeral: true,
    });
    return;
  }
  const category = categoryStr as AccountCategory;

  // 2. Find eligible account
  const isPremiumDrop = category === AccountCategory.PREMIUM;
  const account = db.getAvailableAccountByCategory(category, isPremiumDrop);

  // 3. Handle empty inventory gracefully
  if (!account) {
    const summary = db.getInventorySummary();
    const emptyEmbed = createEmptyInventoryEmbed(category, summary);
    await interaction.reply({ embeds: [emptyEmbed], ephemeral: true });
    return;
  }

  // 4. Record drop in database
  const dropId = generateId();
  db.recordDrop({
    id: dropId,
    accountId: account.id,
    droppedBy: interaction.user.id,
    category: account.category,
    isPremium: account.isPremium,
    mode: modeStr,
    guildId: interaction.guildId || undefined,
    channelId: interaction.channelId || undefined,
    timestamp: Date.now(),
  });

  // 5. Generate embed with appropriate design
  const embed = account.isPremium
    ? createPremiumDropEmbed(account, modeStr)
    : createStandardDropEmbed(account, modeStr);

  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle Inventory Subcommand with pagination.
 */
async function handleInventory(
  interaction: ChatInputCommandInteraction,
  db: DatabaseService
): Promise<void> {
  const isDetailed = interaction.options.getBoolean("detailed") ?? false;
  const requestedPage = interaction.options.getInteger("page") ?? 1;
  const categoryFilterStr = interaction.options.getString("category");

  const summary = db.getInventorySummary();

  // If detailed view or page requested
  if (isDetailed || interaction.options.getInteger("page") !== null) {
    let catFilter: AccountCategory | undefined = undefined;
    if (categoryFilterStr && categoryFilterStr !== "all" && isValidCategory(categoryFilterStr)) {
      catFilter = categoryFilterStr as AccountCategory;
    }

    const pageSize = 5;
    const offset = (requestedPage - 1) * pageSize;

    const { accounts, total } = db.getAccounts({
      category: catFilter,
      limit: pageSize,
      offset,
    });

    const totalPages = Math.ceil(total / pageSize) || 1;
    const pageEmbed = createInventoryDetailedEmbed(
      accounts,
      requestedPage,
      totalPages,
      total
    );

    // Build pagination buttons
    const prevButton = new ButtonBuilder()
      .setCustomId(`inv_prev_${requestedPage}_${catFilter || "all"}`)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(requestedPage <= 1);

    const nextButton = new ButtonBuilder()
      .setCustomId(`inv_next_${requestedPage}_${catFilter || "all"}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(requestedPage >= totalPages);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);

    const response = await interaction.reply({
      embeds: [pageEmbed],
      components: totalPages > 1 ? [row] : [],
      ephemeral: true, // Restrict detailed inventory to authorized admin
    });

    if (totalPages > 1) {
      // Set up interactive button collector
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
      });

      collector.on("collect", async (btnInteraction) => {
        if (!isUserAuthorized(btnInteraction)) {
          await btnInteraction.reply({
            content: "❌ You are not authorized to interact with this inventory view.",
            ephemeral: true,
          });
          return;
        }

        const isNext = btnInteraction.customId.startsWith("inv_next_");
        const newPage = isNext ? requestedPage + 1 : requestedPage - 1;
        const newOffset = (newPage - 1) * pageSize;

        const newQueryResult = db.getAccounts({
          category: catFilter,
          limit: pageSize,
          offset: newOffset,
        });

        const newEmbed = createInventoryDetailedEmbed(
          newQueryResult.accounts,
          newPage,
          totalPages,
          newQueryResult.total
        );

        const newPrev = new ButtonBuilder()
          .setCustomId(`inv_prev_${newPage}_${catFilter || "all"}`)
          .setLabel("◀ Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(newPage <= 1);

        const newNext = new ButtonBuilder()
          .setCustomId(`inv_next_${newPage}_${catFilter || "all"}`)
          .setLabel("Next ▶")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(newPage >= totalPages);

        const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(newPrev, newNext);

        await btnInteraction.update({
          embeds: [newEmbed],
          components: [newRow],
        });
      });
    }

    return;
  }

  // Summary overview mode
  const overviewEmbed = createInventoryOverviewEmbed(summary);
  await interaction.reply({
    embeds: [overviewEmbed],
    ephemeral: true,
  });
}

/**
 * Handle Set Category Subcommand.
 */
async function handleSetCategory(
  interaction: ChatInputCommandInteraction,
  db: DatabaseService
): Promise<void> {
  const username = interaction.options.getString("username", true).trim();
  const categoryStr = interaction.options.getString("category", true);

  if (!isValidCategory(categoryStr)) {
    await interaction.reply({
      content: `❌ Invalid category: \`${categoryStr}\`.`,
      ephemeral: true,
    });
    return;
  }

  const category = categoryStr as AccountCategory;
  const updated = db.updateAccountCategory(username, category);

  if (!updated) {
    await interaction.reply({
      content: `❌ Account with username \`${username}\` not found in inventory.`,
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🏷️ Category Updated")
    .setDescription(
      `Account **${username}** has been moved to category **${formatCategoryName(category)}**.`
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle Delete Account Subcommand.
 */
async function handleDelete(
  interaction: ChatInputCommandInteraction,
  db: DatabaseService
): Promise<void> {
  const username = interaction.options.getString("username", true).trim();
  const deleted = db.deleteAccount(username);

  if (!deleted) {
    await interaction.reply({
      content: `❌ Account with username \`${username}\` was not found in inventory.`,
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🗑️ Account Deleted")
    .setDescription(`Account **${username}** has been permanently removed from inventory.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
