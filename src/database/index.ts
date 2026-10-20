import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import {
  DatabaseService,
  AccountRecord,
  AccountCategory,
  AccountDistributionRecord,
  InventorySummary,
  GetAccountsFilter,
  ServerCheckStatus,
  AccountDistributionStatus,
  DistributionMode,
} from "../types";

function rowToAccount(row: any): AccountRecord {
  let serverStatuses: ServerCheckStatus[] = [];
  try {
    serverStatuses = JSON.parse(row.server_statuses || "[]");
  } catch {}

  let profileMetadata = undefined;
  try {
    if (row.metadata) {
      profileMetadata = JSON.parse(row.metadata);
    }
  } catch {}

  return {
    id: row.id as string,
    username: row.username as string,
    email: row.email as string,
    password: (row.password as string) || undefined,
    category: row.category as AccountCategory,
    isPremium: row.is_premium === 1,
    accountRef: row.account_ref as string,
    minecraftUuid: (row.minecraft_uuid as string) || undefined,
    avatarUrl: (row.avatar_url as string) || undefined,
    notes: (row.notes as string) || undefined,
    distributionStatus: (row.distribution_status as AccountDistributionStatus) || "available",
    serverStatuses,
    profileMetadata,
    addedBy: row.added_by as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToDistribution(row: any): AccountDistributionRecord {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    recipientId: (row.recipient_id as string) || undefined,
    droppedBy: row.dropped_by as string,
    category: row.category as AccountCategory,
    isPremium: row.is_premium === 1,
    mode: row.distribution_mode as DistributionMode,
    guildId: (row.guild_id as string) || undefined,
    channelId: (row.channel_id as string) || undefined,
    timestamp: row.timestamp as number,
  };
}

export class SQLiteService implements DatabaseService {
  private db!: SqlJsDatabase;
  private dbPath: string;
  private saveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async init(): Promise<void> {
    const SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA busy_timeout = 5000");

    // Accounts table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE,
        email TEXT NOT NULL,
        password TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL,
        is_premium INTEGER NOT NULL DEFAULT 0,
        account_ref TEXT NOT NULL UNIQUE,
        minecraft_uuid TEXT,
        avatar_url TEXT,
        notes TEXT,
        distribution_status TEXT NOT NULL DEFAULT 'available',
        server_statuses TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        added_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    try {
      this.db.run("ALTER TABLE accounts ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
    } catch {}
    try {
      this.db.run("ALTER TABLE accounts ADD COLUMN password TEXT NOT NULL DEFAULT ''");
    } catch {}

    // Migrate legacy categories that were removed from the system
    try {
      this.db.run(
        "UPDATE accounts SET category = 'not_banned', is_premium = 0 WHERE category IN ('other', 'donut_banned', 'hypixel_banned')"
      );
      this.db.run("UPDATE accounts SET is_premium = 1 WHERE category = 'premium'");
    } catch {}

    this.db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username COLLATE NOCASE)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_accounts_category ON accounts(category)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_accounts_premium ON accounts(is_premium)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(distribution_status)
    `);

    // Schema update: distribution_history table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS distribution_history (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        recipient_id TEXT,
        dropped_by TEXT NOT NULL,
        category TEXT NOT NULL,
        is_premium INTEGER NOT NULL DEFAULT 0,
        distribution_mode TEXT NOT NULL DEFAULT 'one_time',
        guild_id TEXT,
        channel_id TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_dist_account_id ON distribution_history(account_id)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_dist_timestamp ON distribution_history(timestamp)
    `);

    this.saveInterval = setInterval(() => this.save(), 10_000);
    this.save();
  }

  private save(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  // ==========================================
  // ACCOUNT DROP SYSTEM IMPLEMENTATION
  // ==========================================

  addAccount(account: AccountRecord): void {
    // Duplicate prevention: check username
    const existing = this.getAccountByUsername(account.username);
    if (existing) {
      throw new Error(`Account with username "${account.username}" already exists.`);
    }

    this.db.run(
      `INSERT INTO accounts (
        id, username, email, password, category, is_premium, account_ref,
        minecraft_uuid, avatar_url, notes, distribution_status,
        server_statuses, metadata, added_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.id,
        account.username,
        account.email,
        account.password || "",
        account.category,
        account.isPremium ? 1 : 0,
        account.accountRef,
        account.minecraftUuid || null,
        account.avatarUrl || null,
        account.notes || null,
        account.distributionStatus || "available",
        JSON.stringify(account.serverStatuses || []),
        JSON.stringify(account.profileMetadata || {}),
        account.addedBy,
        account.createdAt,
        account.updatedAt,
      ]
    );
    this.save();
  }

  getAccountByUsername(username: string): AccountRecord | null {
    const stmt = this.db.prepare(
      "SELECT * FROM accounts WHERE LOWER(username) = LOWER(?) LIMIT 1"
    );
    stmt.bind([username.trim()]);
    let result: AccountRecord | null = null;
    if (stmt.step()) {
      result = rowToAccount(stmt.getAsObject());
    }
    stmt.free();
    return result;
  }

  getAccountById(id: string): AccountRecord | null {
    const stmt = this.db.prepare("SELECT * FROM accounts WHERE id = ? LIMIT 1");
    stmt.bind([id]);
    let result: AccountRecord | null = null;
    if (stmt.step()) {
      result = rowToAccount(stmt.getAsObject());
    }
    stmt.free();
    return result;
  }

  getAccountByRef(accountRef: string): AccountRecord | null {
    const stmt = this.db.prepare("SELECT * FROM accounts WHERE account_ref = ? LIMIT 1");
    stmt.bind([accountRef.trim()]);
    let result: AccountRecord | null = null;
    if (stmt.step()) {
      result = rowToAccount(stmt.getAsObject());
    }
    stmt.free();
    return result;
  }

  updateAccount(id: string, updates: Partial<AccountRecord>): void {
    const existing = this.getAccountById(id);
    if (!existing) {
      throw new Error(`Account with ID "${id}" not found.`);
    }

    const merged: AccountRecord = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.db.run(
      `UPDATE accounts SET
        username = ?, email = ?, password = ?, category = ?, is_premium = ?,
        account_ref = ?, minecraft_uuid = ?, avatar_url = ?, notes = ?,
        distribution_status = ?, server_statuses = ?, metadata = ?, updated_at = ?
      WHERE id = ?`,
      [
        merged.username,
        merged.email,
        merged.password || "",
        merged.category,
        merged.isPremium ? 1 : 0,
        merged.accountRef,
        merged.minecraftUuid || null,
        merged.avatarUrl || null,
        merged.notes || null,
        merged.distributionStatus,
        JSON.stringify(merged.serverStatuses || []),
        JSON.stringify(merged.profileMetadata || {}),
        merged.updatedAt,
        id,
      ]
    );
    this.save();
  }

  updateAccountCategory(username: string, category: AccountCategory): boolean {
    const existing = this.getAccountByUsername(username);
    if (!existing) return false;

    const now = Date.now();
    const isPremium = category === AccountCategory.PREMIUM ? 1 : 0;
    this.db.run(
      "UPDATE accounts SET category = ?, is_premium = ?, updated_at = ? WHERE id = ?",
      [category, isPremium, now, existing.id]
    );
    this.save();
    return true;
  }

  deleteAccount(username: string): boolean {
    const existing = this.getAccountByUsername(username);
    if (!existing) return false;

    this.db.run("DELETE FROM accounts WHERE id = ?", [existing.id]);
    this.save();
    return true;
  }

  getAvailableAccountByCategory(
    category: AccountCategory,
    isPremium?: boolean
  ): AccountRecord | null {
    let query = "";
    let params: any[] = [];

    if (category === AccountCategory.PREMIUM || isPremium === true) {
      // Premium account drop: match is_premium = 1 or category = 'premium'
      query = `
        SELECT * FROM accounts
        WHERE (is_premium = 1 OR category = 'premium')
          AND distribution_status = 'available'
        ORDER BY created_at ASC
        LIMIT 1
      `;
    } else {
      // Standard drop by category: only select accounts that are available in this category
      if (isPremium === false) {
        query = `
          SELECT * FROM accounts
          WHERE category = ?
            AND is_premium = 0
            AND distribution_status = 'available'
          ORDER BY created_at ASC
          LIMIT 1
        `;
        params = [category];
      } else {
        query = `
          SELECT * FROM accounts
          WHERE category = ?
            AND distribution_status = 'available'
          ORDER BY created_at ASC
          LIMIT 1
        `;
        params = [category];
      }
    }

    const stmt = this.db.prepare(query);
    stmt.bind(params);
    let result: AccountRecord | null = null;
    if (stmt.step()) {
      result = rowToAccount(stmt.getAsObject());
    }
    stmt.free();
    return result;
  }

  recordDrop(drop: AccountDistributionRecord): void {
    if (drop.mode === "one_time") {
      this.db.run(
        "UPDATE accounts SET distribution_status = 'distributed', updated_at = ? WHERE id = ?",
        [Date.now(), drop.accountId]
      );
    }

    this.db.run(
      `INSERT INTO distribution_history (
        id, account_id, recipient_id, dropped_by, category,
        is_premium, distribution_mode, guild_id, channel_id, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        drop.id,
        drop.accountId,
        drop.recipientId || null,
        drop.droppedBy,
        drop.category,
        drop.isPremium ? 1 : 0,
        drop.mode,
        drop.guildId || null,
        drop.channelId || null,
        drop.timestamp,
      ]
    );
    this.save();
  }

  getInventorySummary(): InventorySummary {
    const summary: InventorySummary = {
      totalStandard: 0,
      totalPremium: 0,
      byCategory: {
        [AccountCategory.NOT_BANNED]: 0,
        [AccountCategory.PREMIUM]: 0,
      },
      availableStandard: 0,
      distributedStandard: 0,
      availablePremium: 0,
      distributedPremium: 0,
      unknownServerStatusCount: 0,
    };

    // Load all accounts to compute exact statistics
    const stmt = this.db.prepare("SELECT * FROM accounts");
    while (stmt.step()) {
      const acc = rowToAccount(stmt.getAsObject());

      if (acc.isPremium) {
        summary.totalPremium++;
        if (acc.distributionStatus === "available") {
          summary.availablePremium++;
        } else {
          summary.distributedPremium++;
        }
      } else {
        summary.totalStandard++;
        if (acc.distributionStatus === "available") {
          summary.availableStandard++;
        } else {
          summary.distributedStandard++;
        }
      }

      if (summary.byCategory[acc.category] !== undefined) {
        summary.byCategory[acc.category]++;
      }

      // Check unknown server status: if no server status or any check failed/unknown
      const isUnknown =
        !acc.serverStatuses ||
        acc.serverStatuses.length === 0 ||
        acc.serverStatuses.some(
          (s) =>
            s.verificationLevel === "unknown" ||
            s.status === "unknown" ||
            (s.details && s.details.toLowerCase().includes("failed"))
        );

      if (isUnknown) {
        summary.unknownServerStatusCount++;
      }
    }
    stmt.free();

    return summary;
  }

  getAccounts(filter?: GetAccountsFilter): { accounts: AccountRecord[]; total: number } {
    let whereClauses: string[] = [];
    let params: any[] = [];

    if (filter?.category) {
      whereClauses.push("category = ?");
      params.push(filter.category);
    }

    if (filter?.isPremium !== undefined) {
      whereClauses.push("is_premium = ?");
      params.push(filter.isPremium ? 1 : 0);
    }

    if (filter?.distributionStatus) {
      whereClauses.push("distribution_status = ?");
      params.push(filter.distributionStatus);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Count total
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM accounts ${whereStr}`);
    countStmt.bind(params);
    let total = 0;
    if (countStmt.step()) {
      total = countStmt.getAsObject().count as number;
    }
    countStmt.free();

    // Query paginated
    let query = `SELECT * FROM accounts ${whereStr} ORDER BY created_at DESC`;
    if (filter?.limit !== undefined) {
      query += ` LIMIT ${filter.limit}`;
      if (filter?.offset !== undefined) {
        query += ` OFFSET ${filter.offset}`;
      }
    }

    const selectStmt = this.db.prepare(query);
    selectStmt.bind(params);
    const accounts: AccountRecord[] = [];
    while (selectStmt.step()) {
      accounts.push(rowToAccount(selectStmt.getAsObject()));
    }
    selectStmt.free();

    return { accounts, total };
  }

  getDistributionHistory(filter?: { accountId?: string; limit?: number }): AccountDistributionRecord[] {
    let query = "SELECT * FROM distribution_history";
    let params: any[] = [];

    if (filter?.accountId) {
      query += " WHERE account_id = ?";
      params.push(filter.accountId);
    }

    query += ` ORDER BY timestamp DESC LIMIT ${filter?.limit ?? 100}`;

    const stmt = this.db.prepare(query);
    stmt.bind(params);
    const results: AccountDistributionRecord[] = [];
    while (stmt.step()) {
      results.push(rowToDistribution(stmt.getAsObject()));
    }
    stmt.free();
    return results;
  }

  close(): void {
    if (this.saveInterval) clearInterval(this.saveInterval);
    this.save();
    this.db.close();
  }
}
