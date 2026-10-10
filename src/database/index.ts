import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import {
  DatabaseService,
  GuildSettings,
  UserModerationRecord,
  ModerationEvent,
  UserState,
  SpamCategory,
  ModerationAction,
  AccountRecord,
  AccountCategory,
  AccountDistributionRecord,
  InventorySummary,
  GetAccountsFilter,
  ServerCheckStatus,
  AccountDistributionStatus,
  DistributionMode,
} from "../types";
import { getDefaultGuildSettings } from "../config";

function rowToAccount(row: any): AccountRecord {
  let serverStatuses: ServerCheckStatus[] = [];
  try {
    serverStatuses = JSON.parse(row.server_statuses || "[]");
  } catch {}

  return {
    id: row.id as string,
    username: row.username as string,
    email: row.email as string,
    category: row.category as AccountCategory,
    isPremium: row.is_premium === 1,
    accountRef: row.account_ref as string,
    minecraftUuid: (row.minecraft_uuid as string) || undefined,
    avatarUrl: (row.avatar_url as string) || undefined,
    notes: (row.notes as string) || undefined,
    distributionStatus: (row.distribution_status as AccountDistributionStatus) || "available",
    serverStatuses,
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

    this.db.run(`
      CREATE TABLE IF NOT EXISTS guilds (
        guild_id TEXT PRIMARY KEY,
        settings TEXT NOT NULL
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        warnings INTEGER DEFAULT 0,
        timeouts INTEGER DEFAULT 0,
        spam_incidents INTEGER DEFAULT 0,
        last_violation INTEGER,
        last_warning INTEGER,
        last_timeout INTEGER,
        violation_severity INTEGER DEFAULT 0,
        total_spam_score INTEGER DEFAULT 0,
        state TEXT DEFAULT 'normal',
        PRIMARY KEY (user_id, guild_id)
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        action TEXT NOT NULL,
        spam_score INTEGER NOT NULL,
        category TEXT NOT NULL,
        reasons TEXT NOT NULL,
        ai_used INTEGER DEFAULT 0,
        ai_confidence REAL,
        ai_classification TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // Schema update: accounts table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE,
        email TEXT NOT NULL,
        category TEXT NOT NULL,
        is_premium INTEGER NOT NULL DEFAULT 0,
        account_ref TEXT NOT NULL UNIQUE,
        minecraft_uuid TEXT,
        avatar_url TEXT,
        notes TEXT,
        distribution_status TEXT NOT NULL DEFAULT 'available',
        server_statuses TEXT NOT NULL DEFAULT '[]',
        added_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

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

  getGuildSettings(guildId: string): GuildSettings {
    const stmt = this.db.prepare("SELECT settings FROM guilds WHERE guild_id = ?");
    stmt.bind([guildId]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      try {
        const parsed = JSON.parse(row.settings as string);
        return { ...getDefaultGuildSettings(guildId), ...parsed };
      } catch {
        return getDefaultGuildSettings(guildId);
      }
    }
    stmt.free();
    return getDefaultGuildSettings(guildId);
  }

  updateGuildSettings(guildId: string, settings: Partial<GuildSettings>): void {
    const existing = this.getGuildSettings(guildId);
    const merged = { ...existing, ...settings, guildId };
    this.db.run("INSERT OR REPLACE INTO guilds (guild_id, settings) VALUES (?, ?)", [
      guildId,
      JSON.stringify(merged),
    ]);
    this.save();
  }

  getUserRecord(userId: string, guildId: string): UserModerationRecord {
    const stmt = this.db.prepare(
      "SELECT * FROM users WHERE user_id = ? AND guild_id = ?"
    );
    stmt.bind([userId, guildId]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return {
        userId: row.user_id as string,
        guildId: row.guild_id as string,
        warnings: row.warnings as number,
        timeouts: row.timeouts as number,
        spamIncidents: row.spam_incidents as number,
        lastViolation: row.last_violation as number | null,
        lastWarning: row.last_warning as number | null,
        lastTimeout: row.last_timeout as number | null,
        violationSeverity: row.violation_severity as number,
        totalSpamScore: row.total_spam_score as number,
        state: (row.state as string) as UserState,
      };
    }
    stmt.free();

    return {
      userId,
      guildId,
      warnings: 0,
      timeouts: 0,
      spamIncidents: 0,
      lastViolation: null,
      lastWarning: null,
      lastTimeout: null,
      violationSeverity: 0,
      totalSpamScore: 0,
      state: UserState.NORMAL,
    };
  }

  updateUserRecord(userId: string, guildId: string, record: Partial<UserModerationRecord>): void {
    const existing = this.getUserRecord(userId, guildId);
    const merged = { ...existing, ...record, userId, guildId };

    this.db.run(
      `INSERT OR REPLACE INTO users
      (user_id, guild_id, warnings, timeouts, spam_incidents, last_violation, last_warning, last_timeout, violation_severity, total_spam_score, state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        merged.userId,
        merged.guildId,
        merged.warnings,
        merged.timeouts,
        merged.spamIncidents,
        merged.lastViolation,
        merged.lastWarning,
        merged.lastTimeout,
        merged.violationSeverity,
        merged.totalSpamScore,
        merged.state,
      ]
    );
    this.save();
  }

  addIncident(event: ModerationEvent): void {
    this.db.run(
      `INSERT INTO incidents
      (id, user_id, guild_id, channel_id, action, spam_score, category, reasons, ai_used, ai_confidence, ai_classification, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.userId,
        event.guildId,
        event.channelId,
        event.action,
        event.spamScore,
        event.category,
        JSON.stringify(event.reasons),
        event.aiUsed ? 1 : 0,
        event.aiConfidence,
        event.aiClassification ? JSON.stringify(event.aiClassification) : null,
        event.timestamp,
      ]
    );
    this.save();
  }

  getIncidents(guildId: string, limit: number = 50): ModerationEvent[] {
    const stmt = this.db.prepare(
      "SELECT * FROM incidents WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?"
    );
    stmt.bind([guildId, limit]);

    const results: ModerationEvent[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id as string,
        userId: row.user_id as string,
        guildId: row.guild_id as string,
        channelId: row.channel_id as string,
        action: row.action as ModerationAction,
        spamScore: row.spam_score as number,
        category: row.category as SpamCategory,
        reasons: JSON.parse(row.reasons as string),
        aiUsed: row.ai_used === 1,
        aiConfidence: row.ai_confidence as number | null,
        aiClassification: row.ai_classification
          ? JSON.parse(row.ai_classification as string)
          : null,
        timestamp: row.timestamp as number,
      });
    }
    stmt.free();
    return results;
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
        id, username, email, category, is_premium, account_ref,
        minecraft_uuid, avatar_url, notes, distribution_status,
        server_statuses, added_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.id,
        account.username,
        account.email,
        account.category,
        account.isPremium ? 1 : 0,
        account.accountRef,
        account.minecraftUuid || null,
        account.avatarUrl || null,
        account.notes || null,
        account.distributionStatus || "available",
        JSON.stringify(account.serverStatuses || []),
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
        username = ?, email = ?, category = ?, is_premium = ?,
        account_ref = ?, minecraft_uuid = ?, avatar_url = ?, notes = ?,
        distribution_status = ?, server_statuses = ?, updated_at = ?
      WHERE id = ?`,
      [
        merged.username,
        merged.email,
        merged.category,
        merged.isPremium ? 1 : 0,
        merged.accountRef,
        merged.minecraftUuid || null,
        merged.avatarUrl || null,
        merged.notes || null,
        merged.distributionStatus,
        JSON.stringify(merged.serverStatuses || []),
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
    this.db.run(
      "UPDATE accounts SET category = ?, updated_at = ? WHERE id = ?",
      [category, now, existing.id]
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
        [AccountCategory.DONUT_BANNED]: 0,
        [AccountCategory.HYPIXEL_BANNED]: 0,
        [AccountCategory.NOT_BANNED]: 0,
        [AccountCategory.OTHER]: 0,
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
