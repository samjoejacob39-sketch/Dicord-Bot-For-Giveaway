import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import fs from "fs";
import path from "path";
import { SQLiteService } from "../src/database";
import {
  AccountCategory,
  AccountRecord,
  AccountDistributionRecord,
} from "../src/types/accounts";
import {
  maskEmail,
  generateAccountRef,
  generateId,
  createServerCheckRecord,
  formatServerStatusesForEmbed,
  isUserAuthorized,
  containsDisallowedSecrets,
} from "../src/utils/security";
import {
  createStandardDropEmbed,
  createPremiumDropEmbed,
  createEmptyInventoryEmbed,
  createInventoryOverviewEmbed,
  createInventoryDetailedEmbed,
  createDropActionRow,
} from "../src/embeds/accountEmbeds";

const TEST_DB_PATH = path.join(__dirname, "temp_test_accgiver.sqlite");

function createMockAccount(overrides: Partial<AccountRecord> = {}): AccountRecord {
  const isPrem = overrides.isPremium ?? false;
  return {
    id: generateId(),
    username: "TestPlayer_" + Math.random().toString(36).substring(2, 7),
    email: "player123@example.com",
    password: "TestPass123!",
    category: isPrem ? AccountCategory.PREMIUM : AccountCategory.NOT_BANNED,
    isPremium: isPrem,
    accountRef: generateAccountRef(isPrem),
    minecraftUuid: "1cc7e61a664b45a29e287bff68128acd",
    avatarUrl: "https://mc-heads.net/avatar/TestPlayer/128",
    notes: isPrem ? "Rank MVP+, Pan Cape" : undefined,
    distributionStatus: "available",
    serverStatuses: [],
    addedBy: "admin-123",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("Account Drop System & Premium Accounts", () => {
  let db: SQLiteService;

  beforeEach(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    db = new SQLiteService(TEST_DB_PATH);
    await db.init();
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch {}
    }
  });

  describe("1. Category Filtering", () => {
    it("should filter and retrieve accounts by standard and premium categories", () => {
      const accStandard = createMockAccount({
        username: "StandardUser",
        category: AccountCategory.NOT_BANNED,
      });
      const accPremium = createMockAccount({
        username: "PremiumUser",
        category: AccountCategory.PREMIUM,
        isPremium: true,
      });

      db.addAccount(accStandard);
      db.addAccount(accPremium);

      const foundStandard = db.getAvailableAccountByCategory(AccountCategory.NOT_BANNED);
      expect(foundStandard).not.toBeNull();
      expect(foundStandard?.username).toBe("StandardUser");
      expect(foundStandard?.category).toBe(AccountCategory.NOT_BANNED);

      const foundPremium = db.getAvailableAccountByCategory(AccountCategory.PREMIUM, true);
      expect(foundPremium).not.toBeNull();
      expect(foundPremium?.username).toBe("PremiumUser");
      expect(foundPremium?.category).toBe(AccountCategory.PREMIUM);
    });

    it("should update account category and premium flag using setcategory", () => {
      const acc = createMockAccount({
        username: "SwitchCategoryUser",
        category: AccountCategory.NOT_BANNED,
      });
      db.addAccount(acc);

      const updated = db.updateAccountCategory("SwitchCategoryUser", AccountCategory.PREMIUM);
      expect(updated).toBe(true);

      const fetched = db.getAccountByUsername("SwitchCategoryUser");
      expect(fetched?.category).toBe(AccountCategory.PREMIUM);
      expect(fetched?.isPremium).toBe(true);

      // Switch back to standard
      db.updateAccountCategory("SwitchCategoryUser", AccountCategory.NOT_BANNED);
      const back = db.getAccountByUsername("SwitchCategoryUser");
      expect(back?.category).toBe(AccountCategory.NOT_BANNED);
      expect(back?.isPremium).toBe(false);
    });
  });

  describe("2. Premium Account Selection & Metadata", () => {
    it("should store premium accounts with isPremium flag and select them on premium drop", () => {
      const standardAcc = createMockAccount({
        username: "StandardUser",
        category: AccountCategory.NOT_BANNED,
        isPremium: false,
      });
      const premiumAcc = createMockAccount({
        username: "GoldUser",
        category: AccountCategory.PREMIUM,
        isPremium: true,
        notes: "Full Access, Minecon Cape",
      });

      db.addAccount(standardAcc);
      db.addAccount(premiumAcc);

      // Dropping premium must select the premium account
      const dropPremium = db.getAvailableAccountByCategory(AccountCategory.PREMIUM, true);
      expect(dropPremium).not.toBeNull();
      expect(dropPremium?.username).toBe("GoldUser");
      expect(dropPremium?.isPremium).toBe(true);
      expect(dropPremium?.notes).toBe("Full Access, Minecon Cape");

      // Dropping standard must select standard account
      const dropStandard = db.getAvailableAccountByCategory(AccountCategory.NOT_BANNED, false);
      expect(dropStandard).not.toBeNull();
      expect(dropStandard?.username).toBe("StandardUser");
      expect(dropStandard?.isPremium).toBe(false);
    });

    it("should generate distinct account references for standard vs premium", () => {
      const stdRef = generateAccountRef(false);
      const premRef = generateAccountRef(true);

      expect(stdRef).toMatch(/^REF-STD-[A-F0-9]{8}$/);
      expect(premRef).toMatch(/^REF-PREM-[A-F0-9]{8}$/);
      expect(stdRef).not.toEqual(premRef);
    });
  });

  describe("3. Empty Inventory Handling", () => {
    it("should return null gracefully when no accounts exist in category", () => {
      const result = db.getAvailableAccountByCategory(AccountCategory.NOT_BANNED);
      expect(result).toBeNull();
    });

    it("should return null once an account has been dropped (consumed)", () => {
      const acc = createMockAccount({
        username: "SingleAccount",
        category: AccountCategory.NOT_BANNED,
      });
      db.addAccount(acc);

      // Initial check: available
      const initial = db.getAvailableAccountByCategory(AccountCategory.NOT_BANNED);
      expect(initial).not.toBeNull();

      // Drop in one_time mode
      db.recordDrop({
        id: generateId(),
        accountId: initial!.id,
        droppedBy: "admin-1",
        category: AccountCategory.NOT_BANNED,
        isPremium: false,
        mode: "one_time",
        timestamp: Date.now(),
      });

      // Subsequent check: depleted
      const afterDrop = db.getAvailableAccountByCategory(AccountCategory.NOT_BANNED);
      expect(afterDrop).toBeNull();
    });

    it("should render empty inventory embed with remaining stock info", () => {
      const summary = db.getInventorySummary();
      const embed = createEmptyInventoryEmbed(AccountCategory.NOT_BANNED, summary);

      expect(embed.data.title).toContain("Inventory Depleted");
      expect(embed.data.description).toContain("Standard (Clean)");
    });
  });

  describe("4. Duplicate Prevention", () => {
    it("should throw error when attempting to add duplicate username", () => {
      const acc1 = createMockAccount({ username: "UniqueGamer" });
      const acc2 = createMockAccount({ username: "UniqueGamer" });

      db.addAccount(acc1);
      expect(() => db.addAccount(acc2)).toThrow(/already exists/i);
    });

    it("should prevent duplicate username regardless of case", () => {
      const acc1 = createMockAccount({ username: "MinecraftSteve" });
      const acc2 = createMockAccount({ username: "minecraftsteve" });

      db.addAccount(acc1);
      expect(() => db.addAccount(acc2)).toThrow(/already exists/i);
    });
  });

  describe("5. Permissions & Authorization", () => {
    it("should authorize bot owner", () => {
      process.env.BOT_OWNER_ID = "999888777";
      const interaction = {
        user: { id: "999888777" },
      };
      expect(isUserAuthorized(interaction)).toBe(true);
    });

    it("should authorize guild owner", () => {
      const interaction = {
        user: { id: "guild-owner-id" },
        guild: { ownerId: "guild-owner-id" },
      };
      expect(isUserAuthorized(interaction)).toBe(true);
    });

    it("should authorize administrator member", () => {
      const interaction = {
        user: { id: "admin-user" },
        memberPermissions: {
          has: (perm: bigint) => perm === PermissionFlagsBits.Administrator,
        },
      };
      expect(isUserAuthorized(interaction)).toBe(true);
    });

    it("should deny unauthorized regular user", () => {
      process.env.BOT_OWNER_ID = "owner-only";
      process.env.ADMIN_IDS = "";
      const interaction = {
        user: { id: "regular-user" },
        guild: { ownerId: "guild-owner" },
        memberPermissions: {
          has: () => false,
        },
      };
      expect(isUserAuthorized(interaction)).toBe(false);
    });
  });

  describe("6. Drop History & Distribution Modes", () => {
    it("should record one_time drop, mark account distributed, and log history", () => {
      const acc = createMockAccount({
        username: "OneTimeAccount",
        category: AccountCategory.NOT_BANNED,
      });
      db.addAccount(acc);

      const dropId = generateId();
      const dropRecord: AccountDistributionRecord = {
        id: dropId,
        accountId: acc.id,
        droppedBy: "admin-42",
        category: AccountCategory.NOT_BANNED,
        isPremium: false,
        mode: "one_time",
        guildId: "guild-123",
        channelId: "chan-456",
        timestamp: Date.now(),
      };

      db.recordDrop(dropRecord);

      const updatedAcc = db.getAccountById(acc.id);
      expect(updatedAcc?.distributionStatus).toBe("distributed");

      // Dropped account no longer appears in the available inventory
      const available = db.getAccounts({
        distributionStatus: "available",
        limit: 10,
      });
      expect(available.accounts.find((a) => a.id === acc.id)).toBeUndefined();

      const history = db.getDistributionHistory({ accountId: acc.id });
      expect(history.length).toBe(1);
      expect(history[0].id).toBe(dropId);
      expect(history[0].droppedBy).toBe("admin-42");
      expect(history[0].mode).toBe("one_time");
    });

    it("should record reusable mode without consuming the account", () => {
      const acc = createMockAccount({
        username: "ReusableAccount",
        category: AccountCategory.NOT_BANNED,
      });
      db.addAccount(acc);

      db.recordDrop({
        id: generateId(),
        accountId: acc.id,
        droppedBy: "admin-42",
        category: AccountCategory.NOT_BANNED,
        isPremium: false,
        mode: "reusable",
        timestamp: Date.now(),
      });

      const updatedAcc = db.getAccountById(acc.id);
      expect(updatedAcc?.distributionStatus).toBe("available");
    });

    it("should record preview mode without consuming the account", () => {
      const acc = createMockAccount({
        username: "PreviewAccount",
        category: AccountCategory.PREMIUM,
        isPremium: true,
      });
      db.addAccount(acc);

      db.recordDrop({
        id: generateId(),
        accountId: acc.id,
        droppedBy: "admin-42",
        category: AccountCategory.PREMIUM,
        isPremium: true,
        mode: "preview",
        timestamp: Date.now(),
      });

      const updatedAcc = db.getAccountById(acc.id);
      expect(updatedAcc?.distributionStatus).toBe("available");
    });
  });

  describe("7. Server Ban Status Integrity", () => {
    it("must NEVER mark an account as unbanned when check failed", () => {
      const failedCheck = createServerCheckRecord("test-server", "check_failed", "unknown");
      expect(failedCheck.status).toBe("unknown");
      expect(failedCheck.verificationLevel).toBe("unknown");

      const inconclusive = createServerCheckRecord(
        "test-server",
        "unbanned",
        "unknown",
        "Check failed: Timeout"
      );
      expect(inconclusive.status).toBe("unknown");
      expect(inconclusive.verificationLevel).toBe("unknown");
    });

    it("clearly distinguishes verified, manually reported, and unknown", () => {
      const verifiedClean = createServerCheckRecord("test-server", "clean", "verified");
      expect(verifiedClean.verificationLevel).toBe("verified");
      expect(verifiedClean.status).toBe("unbanned");

      const reportedBanned = createServerCheckRecord("test-server", "banned", "manually_reported");
      expect(reportedBanned.verificationLevel).toBe("manually_reported");
      expect(reportedBanned.status).toBe("banned");

      const unknownCheck = createServerCheckRecord("test-server", "unknown", "unknown");
      expect(unknownCheck.verificationLevel).toBe("unknown");
      expect(unknownCheck.status).toBe("unknown");

      const formatted = formatServerStatusesForEmbed([
        verifiedClean,
        reportedBanned,
        unknownCheck,
      ]);
      expect(formatted).toContain("🟢 **Test-server**: `Verified Clean`");
      expect(formatted).toContain("⚠️ **Test-server**: `Manually Reported: Banned`");
      expect(formatted).toContain("❓ **Test-server**: `Unknown");
    });

    it("accurately tracks unknown server-status count in inventory summary", () => {
      const acc1 = createMockAccount({
        username: "AccKnown",
        serverStatuses: [
          createServerCheckRecord("test-server", "clean", "verified"),
        ],
      });
      const acc2 = createMockAccount({
        username: "AccUnknown",
        serverStatuses: [
          createServerCheckRecord("test-server", "check_failed", "unknown", "Connection timeout"),
        ],
      });

      db.addAccount(acc1);
      db.addAccount(acc2);

      const summary = db.getInventorySummary();
      expect(summary.unknownServerStatusCount).toBe(1);
    });
  });

  describe("8. Email Masking & Security", () => {
    it("should mask emails securely without exposing username mailbox", () => {
      expect(maskEmail("andy096096@outlook.com")).toBe("an***96@outlook.com");
      expect(maskEmail("john.doe@gmail.com")).toBe("jo***oe@gmail.com");
      expect(maskEmail("ab@domain.com")).toBe("a*@domain.com");
      expect(maskEmail("a@domain.com")).toBe("*@domain.com");
    });

    it("should reject password dumps in input", () => {
      expect(containsDisallowedSecrets("password: MySecret123")).toBe(true);
      expect(containsDisallowedSecrets("token: discord_token_xyz")).toBe(true);
      expect(containsDisallowedSecrets("Safe profile notes with capes")).toBe(false);
    });

    it("drop embeds should include email, password, username, skin links and capes", () => {
      const acc = createMockAccount({
        username: "SecurePlayer",
        email: "supersecretmail@test.com",
        password: "MySecretPass!",
        isPremium: true,
        profileMetadata: {
          skinType: "Classic (Steve)",
          capes: "Yes",
          capeUrl: "https://crafatar.com/capes/abc123",
          hasCape: true,
        },
      });

      const embed = createPremiumDropEmbed(acc);
      const serialized = JSON.stringify(embed.toJSON());

      expect(serialized).toContain("supersecretmail@test.com");
      expect(serialized).toContain("MySecretPass!");
      expect(serialized).toContain("SecurePlayer");
      expect(serialized).toContain("crafatar.com/capes/abc123");
    });
  });

  describe("9. Inventory Summary & Pagination", () => {
    it("should accurately count standard and premium accounts", () => {
      db.addAccount(createMockAccount({ isPremium: false, category: AccountCategory.NOT_BANNED }));
      db.addAccount(createMockAccount({ isPremium: false, category: AccountCategory.NOT_BANNED }));
      db.addAccount(createMockAccount({ isPremium: true, category: AccountCategory.PREMIUM }));

      const summary = db.getInventorySummary();
      expect(summary.totalStandard).toBe(2);
      expect(summary.totalPremium).toBe(1);
      expect(summary.byCategory[AccountCategory.NOT_BANNED]).toBe(2);
      expect(summary.byCategory[AccountCategory.PREMIUM]).toBe(1);
      expect(summary.availableStandard).toBe(2);
      expect(summary.availablePremium).toBe(1);
    });

    it("should paginate available accounts accurately", () => {
      for (let i = 1; i <= 12; i++) {
        db.addAccount(createMockAccount({ username: `Player_${i.toString().padStart(2, "0")}` }));
      }

      const page1 = db.getAccounts({
        distributionStatus: "available",
        limit: 5,
        offset: 0,
      });
      expect(page1.total).toBe(12);
      expect(page1.accounts.length).toBe(5);

      const page2 = db.getAccounts({
        distributionStatus: "available",
        limit: 5,
        offset: 5,
      });
      expect(page2.accounts.length).toBe(5);

      const page3 = db.getAccounts({
        distributionStatus: "available",
        limit: 5,
        offset: 10,
      });
      expect(page3.accounts.length).toBe(2);
    });

    it("should render detailed inventory embed with page headers", () => {
      const accounts = [createMockAccount({ username: "PageUser1" })];
      const embed = createInventoryDetailedEmbed(accounts, 1, 3, 15);

      expect(embed.data.title).toBe("📋 Account Inventory — Page 1 of 3");
      expect(embed.data.fields?.length).toBe(1);
      expect(embed.data.fields?.[0].name).toContain("PageUser1");
    });
  });

  describe("10. Embed Designs", () => {
    it("should generate dark embed for standard drops", () => {
      const acc = createMockAccount({ isPremium: false });
      const embed = createStandardDropEmbed(acc);

      expect(embed.data.color).toBe(0x0099ff); // Blue theme
      expect(embed.data.title).toContain("Account Dropped");
      expect(embed.data.thumbnail?.url).toBe(acc.avatarUrl);
    });

    it("should generate gold-themed embed for premium drops", () => {
      const acc = createMockAccount({ isPremium: true });
      const embed = createPremiumDropEmbed(acc);

      expect(embed.data.color).toBe(0xffd700); // Pure Gold
      expect(embed.data.title).toContain("PREMIUM DROP");
      expect(embed.data.image?.url).toContain("mc-heads.net/"); // High-res 3D combo render
    });

    it("should make the embed title and author clickable links", () => {
      const acc = createMockAccount({ username: "LinkPlayer" });
      const embed = createStandardDropEmbed(acc);

      expect(embed.data.url).toBe("https://namemc.com/profile/LinkPlayer");
      expect(embed.data.author?.url).toBe("https://namemc.com/profile/LinkPlayer");
    });

    it("should include masked quick links inside the embed", () => {
      const acc = createMockAccount({ username: "LinkPlayer" });
      const embed = createStandardDropEmbed(acc);

      const quickLinks = embed.data.fields?.find(
        (field) => field.name === "🔗 Quick Links"
      );
      expect(quickLinks).toBeDefined();
      expect(quickLinks?.value).toContain("[NameMC Profile](");
      expect(quickLinks?.value).toContain("[3D Skin Render](");
      expect(quickLinks?.value).toContain("[Minecraft Login](");
    });

    it("should attach link buttons for NameMC, skin and login", () => {
      const acc = createMockAccount({ username: "LinkPlayer" });
      const row = createDropActionRow(acc);
      const json = row.toJSON();
      const buttons = json.components as Array<{
        label: string;
        style: number;
        url?: string;
      }>;

      expect(buttons.map((button) => button.label)).toEqual([
        "NameMC Profile",
        "3D Skin",
        "Minecraft Login",
      ]);
      expect(buttons.every((button) => button.style === 5)).toBe(true); // Link style
      expect(buttons[0].url).toBe("https://namemc.com/profile/LinkPlayer");
      expect(buttons[2].url).toBe("https://www.minecraft.net/login");
    });

    it("should add a cape link button when the account owns a cape", () => {
      const acc = createMockAccount({
        profileMetadata: {
          hasCape: true,
          capeUrl: "https://crafatar.com/capes/abc123",
        },
      });
      const row = createDropActionRow(acc);
      const buttons = row.toJSON().components as Array<{
        label: string;
        url?: string;
      }>;

      const capeButton = buttons.find((button) => button.label === "Cape");
      expect(capeButton?.url).toBe("https://crafatar.com/capes/abc123");
    });

    it("should generate inventory overview embed", () => {
      const summary = db.getInventorySummary();
      const embed = createInventoryOverviewEmbed(summary);

      expect(embed.data.title).toBe("📊 Account Inventory Overview");
      expect(embed.data.fields?.length).toBe(3);
    });
  });
});
