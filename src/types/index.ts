export * from "./accounts";
import {
  AccountRecord,
  AccountCategory,
  AccountDistributionRecord,
  InventorySummary,
  GetAccountsFilter,
} from "./accounts";

export interface DatabaseService {
  init(): Promise<void>;
  // Account drop system methods
  addAccount(account: AccountRecord): void;
  getAccountByUsername(username: string): AccountRecord | null;
  getAccountById(id: string): AccountRecord | null;
  getAccountByRef(accountRef: string): AccountRecord | null;
  updateAccount(id: string, updates: Partial<AccountRecord>): void;
  updateAccountCategory(username: string, category: AccountCategory): boolean;
  deleteAccount(username: string): boolean;
  getAvailableAccountByCategory(category: AccountCategory, isPremium?: boolean): AccountRecord | null;
  recordDrop(drop: AccountDistributionRecord): void;
  getInventorySummary(): InventorySummary;
  getAccounts(filter?: GetAccountsFilter): { accounts: AccountRecord[]; total: number };
  getDistributionHistory(filter?: { accountId?: string; limit?: number }): AccountDistributionRecord[];
  close(): void;
}
