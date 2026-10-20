# Discord Bot — Account Drop System

A Discord bot for managing Minecraft account inventory and dropping accounts, built with **Node.js**, **TypeScript**, **Discord.js v14**, and **SQLite**.

---

## 🚀 Features

### Account Drop System + Premium Accounts (`/accgiver`)
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
  - **Masked Quick Links**: Fields link to NameMC, the 3D skin render, the cape render, and Minecraft login.
  - **Link Buttons**: Dedicated buttons below each drop open NameMC, the 3D skin, the cape (when owned), and Minecraft login.
  - **Customer Delivery Card**: Copy-ready credential block, personal recipient ping, live “delivered X ago” timestamp, and staff delivery credit.
  - **Cape Showcase**: Accounts with a cape get a second card with a high-resolution cape render.
  - **Server Branding**: Drop cards use the server name and icon in the author line.
  - **Depleted Inventory Alert**: Warning embed detailing remaining stock.
  - **Inventory Overview & Pagination**: Stock breakdowns with interactive page navigation buttons.
- **Automatic Minecraft Lookup**:
  - Username casing, UUID, skin model (Classic/Slim), skin renders, and cape ownership are fetched automatically from PlayerDB / Mojang texture data.
  - Cape renders are provided via Crafatar.
- **Privacy & Security**:
  - Use drop commands only in private or staff-only channels — embeds contain account credentials.
  - Only distribute accounts you own or have explicit permission to share.
  - Accounts are referenced by unique tokens (e.g. `REF-STD-XXXX`, `REF-PREM-XXXX`).

---

## 🛠️ Slash Commands

### `/accgiver` — Account Management & Drop System

| Subcommand | Syntax | Description |
|---|---|---|
| `addacc` | `/accgiver addacc username:<name> email:<email> password:<pass> [notes]` | Adds a standard account to stock. |
| `addaccpremium` | `/accgiver addaccpremium username:<name> email:<email> password:<pass> [notes]` | Adds a premium account with `is_premium` flag. |
| `drop` | `/accgiver drop type:<premium\|standard> [recipient:@user]` | Drops an account of the chosen type, removes it from inventory, pings the recipient (optional), and posts the delivery card. |
| `inventory` | `/accgiver inventory [page] [category] [detailed]` | Shows available inventory summary and paginated accounts. |
| `setcategory` | `/accgiver setcategory username:<name> category:<cat>` | Changes an account between premium and standard. |
| `delete` | `/accgiver delete username:<name>` | Permanently removes an account from inventory. |

---

## 📦 Database Schema (SQLite)

The SQLite database (`./data/giveaway.sqlite` by default) persists the following tables:

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
- `metadata` (TEXT NOT NULL DEFAULT '{}') — JSON profile metadata (skin model, capes)
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
- `distribution_mode` (TEXT NOT NULL) — `one_time`
- `guild_id` (TEXT) — Guild where drop occurred
- `channel_id` (TEXT) — Channel where drop occurred
- `timestamp` (INTEGER NOT NULL) — Unix epoch in ms

---

## 🚀 Deployment Guide

### 1. Prerequisites
- Node.js >= 18.0.0
- npm or yarn

### 2. Configuration (`.env`)
Copy `.env.example` to `.env` and fill in:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_bot_application_id_here
GUILD_ID=your_testing_guild_id_here # Optional: deploys instantly to this guild

# Bot Owner & Admin Permissions
BOT_OWNER_ID=your_discord_user_id
ADMIN_IDS=your_discord_user_id,another_admin_id

# Database
DATABASE_PATH=./data/giveaway.sqlite

LOG_LEVEL=info
```

### 3. Build & Deploy Slash Commands
Compile the project, then register `/accgiver` with Discord:

```bash
npm run build

# Instant guild deployment (recommended for development):
node dist/deploy-commands.js

# Or deploy globally (may take up to 1 hour to propagate across Discord):
# (unset GUILD_ID in .env first)
node dist/deploy-commands.js
```

### 4. Start the Bot

```bash
# Production:
npm start

# Background process management with PM2:
pm2 start dist/index.js --name "giveaway-bot"
pm2 save
```

### 5. Run Tests

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
