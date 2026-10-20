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
  ServerCheckStatus,
} from "../types";
import {
  createDropActionRow,
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
          .setDescription("Associated email address")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("password")
          .setDescription("Account password (shown in the drop embed)")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("notes")
          .setDescription("Profile metadata (capes, ranks)")
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
          .setDescription("Associated email address")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("password")
          .setDescription("Account password (shown in the drop embed)")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("notes")
          .setDescription("Profile metadata (capes, ranks)")
          .setRequired(false)
      )
  )

  // 3. Drop account (premium or standard)
  .addSubcommand((sub) =>
    sub
      .setName("drop")
      .setDescription("Drop a premium or standard account (consumes it from inventory)")
      .addStringOption((opt) =>
        opt
          .setName("type")
          .setDescription("Which type of account to drop")
          .setRequired(true)
          .addChoices(
            { name: "⭐ Premium", value: "premium" },
            { name: "🟢 Standard", value: "standard" }
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
            { name: "⭐ Premium", value: AccountCategory.PREMIUM },
            { name: "🟢 Standard", value: AccountCategory.NOT_BANNED }
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
            { name: "⭐ Premium", value: AccountCategory.PREMIUM },
            { name: "🟢 Standard", value: AccountCategory.NOT_BANNED }
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
  const password = interaction.options.getString("password", true).trim();
  const category = isPremium ? AccountCategory.PREMIUM : AccountCategory.NOT_BANNED;
  const notes = interaction.options.getString("notes")?.trim();

  // Security check: do not allow credential dumps inside notes/email fields
  if (containsDisallowedSecrets(notes) || containsDisallowedSecrets(email)) {
    await interaction.reply({
      content:
        "❌ **Invalid input:** Do not paste raw password/token dumps into the notes or email fields. Use the dedicated `password` option.",
      ephemeral: true,
    });
    return;
  }

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
    password,
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
      capes: profile.capes,
      capeUrl: profile.capeUrl,
      hasCape: profile.hasCape,
      nameChangeable: profile.nameChangeable,
      lastNameChange: profile.lastNameChange,
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
      ? createPremiumDropEmbed(newAccount)
      : createStandardDropEmbed(newAccount);

    await interaction.editReply({
      content: `✅ **${isPremium ? "Premium Golden" : "Standard"} Account Registered Successfully!** Here is the preview:`,
      embeds: [embed],
      components: [createDropActionRow(newAccount)],
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
  const type = interaction.options.getString("type", true);
  const isPremiumDrop = type === "premium";
  const category = isPremiumDrop
    ? AccountCategory.PREMIUM
    : AccountCategory.NOT_BANNED;

  // Find eligible account
  const account = db.getAvailableAccountByCategory(category, isPremiumDrop);

  // Handle empty inventory gracefully
  if (!account) {
    const summary = db.getInventorySummary();
    const emptyEmbed = createEmptyInventoryEmbed(category, summary);
    await interaction.reply({ embeds: [emptyEmbed], ephemeral: true });
    return;
  }

  // Record drop in database — always one_time so the account leaves inventory
  const dropId = generateId();
  db.recordDrop({
    id: dropId,
    accountId: account.id,
    droppedBy: interaction.user.id,
    category: account.category,
    isPremium: account.isPremium,
    mode: "one_time",
    guildId: interaction.guildId || undefined,
    channelId: interaction.channelId || undefined,
    timestamp: Date.now(),
  });

  // Generate embed with appropriate design
  const embed = account.isPremium
    ? createPremiumDropEmbed(account)
    : createStandardDropEmbed(account);

  await interaction.reply({
    embeds: [embed],
    components: [createDropActionRow(account)],
  });
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
      distributionStatus: "available",
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
          distributionStatus: "available",
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
