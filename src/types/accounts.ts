export enum AccountCategory {
  NOT_BANNED = "not_banned",
  PREMIUM = "premium",
}

export type VerificationLevel = "verified" | "manually_reported" | "unknown";
export type BanState = "banned" | "unbanned" | "unknown";
export type DistributionMode = "one_time" | "reusable" | "preview";
export type AccountDistributionStatus = "available" | "distributed";

export interface ServerCheckStatus {
  server: string;
  status: BanState;
  verificationLevel: VerificationLevel;
  lastChecked: number;
  details?: string;
}

export interface AccountProfileMetadata {
  skinType?: string;
  capes?: string;
  nameChangeable?: boolean;
  lastNameChange?: string;
  anarchyRecord?: string;
  emailChangeable?: boolean;
  passwordChangeable?: boolean;
  gameType?: string;
}

export interface AccountRecord {
  id: string;
  username: string;
  email: string; // Stored securely in database, masked in user-facing embeds
  category: AccountCategory;
  isPremium: boolean;
  accountRef: string;
  minecraftUuid?: string;
  avatarUrl?: string;
  notes?: string;
  distributionStatus: AccountDistributionStatus;
  serverStatuses: ServerCheckStatus[];
  profileMetadata?: AccountProfileMetadata;
  addedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface AccountDistributionRecord {
  id: string;
  accountId: string;
  droppedBy: string;
  category: AccountCategory;
  isPremium: boolean;
  mode: DistributionMode;
  guildId?: string;
  channelId?: string;
  recipientId?: string;
  timestamp: number;
}

export interface InventorySummary {
  totalStandard: number;
  totalPremium: number;
  byCategory: Record<AccountCategory, number>;
  availableStandard: number;
  distributedStandard: number;
  availablePremium: number;
  distributedPremium: number;
  unknownServerStatusCount: number;
}

export interface GetAccountsFilter {
  category?: AccountCategory;
  isPremium?: boolean;
  distributionStatus?: AccountDistributionStatus;
  limit?: number;
  offset?: number;
}
