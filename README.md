# Discord Bot — Anti-Spam & Account Drop System

A production-quality Discord Bot built with **Node.js**, **TypeScript**, **Discord.js v14**, and **SQLite**. Features include a comprehensive **Account Drop & Premium Accounts Management System** alongside the existing **Local Spam & Flood Moderation Engine**.

---

## 🚀 Features Overview

### 1. Account Drop System + Premium Accounts (`/accgiver`)
- **Account Types**:
  - `standard` (`not_banned`) — Clean Minecraft accounts
  - `premium` — High-tier premium Minecraft accounts
- **Drop & Consume**:
  - Every `/accgiver drop` removes the account from the available inventory permanently.
  - Dropped accounts are recorded in distribution history for auditing.
- **Role & Owner Authorization**:
  - Only the bot owner (`BOT_OWNER_ID`), configured administrators (`ADMIN_IDS`), guild owners, and users with the Discord `Administrator` permission can manage inventory, edit categories, or trigger drops.
- **Beautiful Embeds**:
  - **Standard Drop**: Rich blue embed with email, password, username, cape status, and a 3D skin render.
  - **Premium Drop**: Luxurious golden-themed version of the same embed with exclusive badges.
  - **Clickable Embed Links**: The embed title and author link to the account's NameMC profile.
  - **Masked Quick Links**: Description fields link to NameMC, the 3D skin render, the cape render, and Minecraft login.
  - **Link Buttons**: Dedicated buttons below each drop open NameMC, the 3D skin, the cape (when owned), and Minecraft login.
  - **Depleted Inventory Alert**: Warning embed detailing remaining stock.
  - **Inventory Overview & Pagination**: Stock breakdowns with interactive page navigation buttons.
- **Automatic Minecraft Lookup**:
  - Username casing, UUID, skin model (Classic/Slim), skin renders, and cape ownership are fetched automatically from PlayerDB / Mojang texture data.
  - Cape renders are provided via Crafatar.
- **Privacy & Security**:
  - Use drop commands only in private or staff-only channels — embeds contain account credentials.
  - Only distribute accounts you own or have explicit permission to share.
  - Accounts are referenced by unique tokens (e.g. `REF-STD-XXXX`, `REF-PREM-XXXX`).

### 2. Anti-Spam Moderation Engine (`/antispam`)
- **Local Heuristics Engine**: Zero API latency for routine messages.
- **Weighted Scoring**: Message frequency, text similarity, reward farming patterns, mentions, emojis, and repetition.
- **Escalation**: Warnings → Strong Warnings → Timeouts → Severe Timeouts.
- **AI Fallback**: Optional OpenRouter integration for ambiguous borderline incidents.

---

## 🛠️ Slash Commands Reference

### `/accgiver` — Account Management & Drop System

| Subcommand | Syntax | Description |
|---|---|---|
| `addacc` | `/accgiver addacc username:<name> email:<email> password:<pass> [notes]` | Adds a standard account to stock. |
| `addaccpremium` | `/accgiver addaccpremium username:<name> email:<email> password:<pass> [notes]` | Adds a premium account with `is_premium` flag. |
| `drop` | `/accgiver drop type:<premium\|standard>` | Drops an account of the chosen type, removes it from inventory, and posts the account embed. |
| `inventory` | `/accgiver inventory [page] [category] [detailed]` | Shows available inventory summary and paginated accounts. |
| `setcategory` | `/accgiver setcategory username:<name> category:<cat>` | Changes an account between premium and standard. |
| `delete` | `/accgiver delete username:<name>` | Permanently removes an account from inventory. |

### `/antispam` — Moderation Configuration

| Subcommand | Description |
|---|---|
| `/antispam enable` | Enables the anti-spam moderation filter on the server. |
| `/antispam disable` | Disables the anti-spam moderation filter. |
| `/antispam status` | Displays current scoring thresholds and settings. |
| `/antispam config` | Configures thresholds, timeout durations, and log channels. |
| `/antispam user @user` | Inspects a user's infraction history and spam score. |
| `/antispam reset @user` | Clears moderation penalties for a user. |

---

## 📦 Database Schema (SQLite)

The SQLite database (`./data/antispam.sqlite` by default) persists the following tables:

### `accounts`
- `id` (TEXT PRIMARY KEY) — UUID v4
- `username` (TEXT NOT NULL COLLATE NOCASE) — Minecraft username (unique)
- `email` (TEXT NOT NULL) — Account email shown in drop embeds
- `password` (TEXT NOT NULL DEFAULT '') — Account password shown in drop embeds
- `category` (TEXT NOT NULL) — `not_banned`, `premium`
- `is_premium` (INTEGER NOT NULL DEFAULT 0) — Boolean flag (1 for premium)
- `account_ref` (TEXT UNIQUE NOT NULL) — e.g. `REF-STD-A1B2C3D4` or `REF-PREM-XYZ123`
- `minecraft_uuid` (TEXT) — Mojang UUID (resolved automatically)
- `avatar_url` (TEXT) — Head avatar URL
- `notes` (TEXT) — Profile details (capes, ranks, etc.)
- `distribution_status` (TEXT NOT NULL DEFAULT 'available') — `available` or `distributed`
- `server_statuses` (TEXT NOT NULL DEFAULT '[]') — JSON array of server checks
- `added_by` (TEXT NOT NULL) — Discord User ID of administrator
- `created_at` (INTEGER NOT NULL) — Unix epoch in ms
- `updated_at` (INTEGER NOT NULL) — Unix epoch in ms

### `distribution_history`
- `id` (TEXT PRIMARY KEY) — UUID v4
- `account_id` (TEXT NOT NULL) — Foreign reference to `accounts.id`
- `recipient_id` (TEXT) — Recipient user ID (optional)
- `dropped_by` (TEXT NOT NULL) — Administrator user ID
- `category` (TEXT NOT NULL) — Category dropped
- `is_premium` (INTEGER NOT NULL) — Premium flag
- `distribution_mode` (TEXT NOT NULL) — `one_time`, `reusable`, or `preview`
- `guild_id` (TEXT) — Guild where drop occurred
- `channel_id` (TEXT) — Channel where drop occurred
- `timestamp` (INTEGER NOT NULL) — Unix epoch in ms

### `guilds`, `users`, `incidents`
- Persist anti-spam configuration, incident logs, and moderation escalation.

---

## 🚀 Deployment Guide

### 1. Prerequisites
- Node.js >= 18.0.0
- npm or yarn

### 2. Configuration (`.env`)
Create or edit `.env`:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_bot_application_id_here
GUILD_ID=your_testing_guild_id_here # Optional: deploys instantly to this guild

# Bot Owner & Admin Permissions
BOT_OWNER_ID=1318146773545517087
ADMIN_IDS=1318146773545517087,your_secondary_admin_id

# Database
DATABASE_PATH=./data/antispam.sqlite

# Anti-Spam / AI Settings
AI_ENABLED=true
OPENROUTER_API_KEY=your_key_here # Optional
OPENROUTER_MODEL=openrouter/free
```

### 3. Deploy Slash Commands
Register `/accgiver` and `/antispam` with Discord:

```bash
# Instant guild deployment (recommended for development):
GUILD_ID=1505787620620238949 npm run deploy-commands

# Or global deployment (may take up to 1 hour to propagate across Discord):
npm run deploy-commands
```

### 4. Build TypeScript
Compile the project:

```bash
npm run build
```

### 5. Start the Bot

```bash
# Production:
npm start

# Development mode with live ts-node:
npm run dev

# Background process management with PM2:
pm2 start dist/index.js --name "discord-ultimate-bot"
pm2 save
```

### 6. Run Tests
Execute the Vitest test suite:

```bash
npm test
```

---

## 🔒 Security Best Practices

1. **Private Drops Only**: Drop embeds contain email/password credentials. Only run `/accgiver drop` in private or staff-only channels.
2. **Right to Distribute**: Only add accounts you own or have explicit permission to share.
3. **Access Control**: Keep `BOT_OWNER_ID` and `ADMIN_IDS` restricted in `.env`.
4. **Protect `.env`**: Never commit your bot token — `.env` is already git-ignored.
5. **Fail-Safe Status**: Never mark an account as clean/unbanned when a check is inconclusive. Server checks default to `unknown` to prevent false representations.
