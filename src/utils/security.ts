import crypto from "crypto";
import { PermissionFlagsBits } from "discord.js";
import {
  AccountCategory,
  BanState,
  ServerCheckStatus,
  VerificationLevel,
} from "../types/accounts";

/**
 * Mask an email address to protect privacy.
 * E.g., "andy096096@outlook.com" -> "an***96@outlook.com"
 * Never leaks the full local part.
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return "***@***.***";
  }

  const [localPart, domain] = email.split("@");
  if (!domain) {
    return "***@***.***";
  }

  const trimmedLocal = localPart.trim();
  if (trimmedLocal.length <= 1) {
    return `*@${domain}`;
  } else if (trimmedLocal.length <= 3) {
    return `${trimmedLocal[0]}*@${domain}`;
  } else if (trimmedLocal.length <= 5) {
    return `${trimmedLocal[0]}***${trimmedLocal[trimmedLocal.length - 1]}@${domain}`;
  } else {
    const start = trimmedLocal.slice(0, 2);
    const end = trimmedLocal.slice(-2);
    return `${start}***${end}@${domain}`;
  }
}

/**
 * Generates an account reference string.
 * Used in place of raw credentials in commands and embeds.
 */
export function generateAccountRef(isPremium: boolean): string {
  const prefix = isPremium ? "REF-PREM" : "REF-STD";
  const randomSuffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${randomSuffix}`;
}

/**
 * Generates a standard UUID v4.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Validates whether a category is valid.
 */
export function isValidCategory(category: string): category is AccountCategory {
  return Object.values(AccountCategory).includes(category as AccountCategory);
}

/**
 * Validates that an input does not look like raw Microsoft passwords or sensitive tokens.
 */
export function containsDisallowedSecrets(value?: string | null): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  // Reject explicit password-like tags or token dumps
  if (
    lower.includes("password:") ||
    lower.includes("pass:") ||
    lower.includes("token:") ||
    lower.includes("secret:")
  ) {
    return true;
  }
  return false;
}

/**
 * Creates and normalizes a ServerCheckStatus record.
 * GUARANTEE: Never mark an account as unbanned just because a server check failed.
 */
export function createServerCheckRecord(
  server: "hypixel" | "donutsmp" | string,
  rawStatus: string,
  rawVerification?: string,
  details?: string,
  timestamp?: number
): ServerCheckStatus {
  const normStatus = rawStatus.toLowerCase().trim();
  const normVerif = (rawVerification || "").toLowerCase().trim();
  const isFailed =
    normStatus === "check_failed" ||
    normStatus === "failed" ||
    normStatus === "unknown" ||
    (details && details.toLowerCase().includes("failed"));

  let verificationLevel: VerificationLevel = "unknown";
  if (!isFailed) {
    if (normVerif === "verified") {
      verificationLevel = "verified";
    } else if (normVerif === "manually_reported" || normVerif === "reported") {
      verificationLevel = "manually_reported";
    }
  }

  let status: BanState = "unknown";
  if (isFailed || verificationLevel === "unknown") {
    // If check failed or unverified, status MUST remain unknown
    status = "unknown";
    verificationLevel = "unknown";
  } else if (normStatus === "banned") {
    status = "banned";
  } else if (normStatus === "clean" || normStatus === "unbanned" || normStatus === "not_banned") {
    status = "unbanned";
  } else {
    status = "unknown";
    verificationLevel = "unknown";
  }

  return {
    server: server.toLowerCase(),
    status,
    verificationLevel,
    lastChecked: timestamp ?? Date.now(),
    details: isFailed ? (details || "Check failed / inconclusive") : details,
  };
}

/**
 * Formats server status list for embeds with explicit badges.
 */
export function formatServerStatusesForEmbed(statuses: ServerCheckStatus[]): string {
  if (!statuses || statuses.length === 0) {
    return "❓ **Hypixel**: `Unknown (Pending check)`\n❓ **DonutSMP**: `Unknown (Pending check)`";
  }

  return statuses
    .map((s) => {
      const serverName = s.server.charAt(0).toUpperCase() + s.server.slice(1);
      let badge = "❓";
      let statusText = "Unknown";

      if (s.verificationLevel === "verified") {
        if (s.status === "banned") {
          badge = "🔴";
          statusText = "Verified Banned";
        } else if (s.status === "unbanned") {
          badge = "🟢";
          statusText = "Verified Clean";
        } else {
          badge = "❓";
          statusText = "Unknown (Check failed)";
        }
      } else if (s.verificationLevel === "manually_reported") {
        if (s.status === "banned") {
          badge = "⚠️";
          statusText = "Manually Reported: Banned";
        } else if (s.status === "unbanned") {
          badge = "⚠️";
          statusText = "Manually Reported: Clean";
        } else {
          badge = "❓";
          statusText = "Unknown (Unverified)";
        }
      } else {
        // Unknown verification level
        badge = "❓";
        statusText = s.details ? `Unknown (${s.details})` : "Unknown (Check failed)";
      }

      return `${badge} **${serverName}**: \`${statusText}\``;
    })
    .join("\n");
}

/**
 * Check if a Discord user is an authorized administrator or bot owner.
 */
export function isUserAuthorized(interaction: {
  user: { id: string };
  memberPermissions?: any;
  guild?: { ownerId: string } | null;
}): boolean {
  const userId = interaction.user.id;

  // 1. Bot owner from environment
  const botOwnerId = process.env.BOT_OWNER_ID || "1318146773545517087";
  if (botOwnerId && userId === botOwnerId) {
    return true;
  }

  // 2. Extra admin IDs
  const adminIds = (process.env.ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (adminIds.includes(userId)) {
    return true;
  }

  // 3. Guild owner
  if (interaction.guild && interaction.guild.ownerId === userId) {
    return true;
  }

  // 4. Guild Administrator permission
  if (interaction.memberPermissions && typeof interaction.memberPermissions.has === "function") {
    if (interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return true;
    }
  }

  return false;
}
