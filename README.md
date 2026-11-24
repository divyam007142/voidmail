# Announcement Bot

A professional Discord bot for server-wide announcements with delivery reports, audit logs, and persistent configuration. Built with Node.js and discord.js v14, storing all data in local JSON files (no external database required).

## Features

- **`/panel`** — posts a reusable announcement panel with a "Create Announcement" button. The panel keeps working after restarts.
- **`/setup`** — configure the panel channel, announcement channel, authorized role, ping role, and DM delivery, all through Discord.
- **Announcement workflow** — a modal collects title, description, optional banner URL, and optional attachment URL; an ephemeral preview with creator-only Send/Cancel buttons is shown before anything is posted.
- **Broadcast engine** — delivers to the configured announcement channel with an optional role ping, plus an opt-in-only DM mode that respects rate limits.
- **`/stats`** — real bot, process, and host metrics (CPU, memory, latency, uptime) and announcement counts.
- **`/announcement-history`** — paginated history with filters (all / completed / failed / in progress) and delivery percentages.
- **`/audit`** — permanent, append-only audit log of administrative actions with pagination.
- **`/announce-dm`** — members opt in or out of announcement DMs. The bot never sends unsolicited DMs.
- Duplicate protection (content fingerprinting + in-flight guard), centralized error handling, and rate-limit-aware retries.

## Configuration

1. Copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN` — from the [Discord Developer Portal](https://discord.com/developers/applications) → Bot → Token.
   - `DISCORD_CLIENT_ID` — from the same portal → General Information → Application ID.
   - Optionally `GUILD_ID` for instant command registration in one server.
2. On Replit, put the same values in **Tools → Secrets** instead of a `.env` file.

### Custom emojis

By default the bot uses readable Unicode fallbacks. To use your application's registered emojis:

1. In Discord, type `:your-emoji:` and copy the raw form (e.g. `<:megaphone:1234567890123456789>`), or copy the ID from the Developer Portal → Application → Emojis.
2. Set the matching `EMOJI_*` variable in `.env` / Replit Secrets (see `.env.example` for the full list). All embeds pick the change up automatically on restart.

### Authorized role

The role allowed to create and send announcements is configured either:

- Per server, with the `/setup` command (choose "Authorized role"), or
- Globally, via the `AUTHORIZED_ROLE_ID` environment variable.

Server owners always retain access regardless of the role. Everyone else receives a clean, private permission-denied message. Permissions are re-validated inside every interaction handler.

### Announcement channels

Use `/setup` in your server to set:

- **Panel channel** — where `/panel` posts the announcement panel.
- **Announcement channel** — where confirmed announcements are broadcast.
- **Announcement ping role** — an optional role mentioned with each announcement.
- **DM delivery** — toggles delivery by DM to members who opted in with `/announce-dm`.

### Inviting the bot

Use this invite URL, replacing `CLIENT_ID` with your application ID:

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot+applications.commands&permissions=414464658432
```

The permissions include View Channels, Send Messages, Embed Links, Attach Files, and Read Message History.

## Running on Replit

1. Import this project (or paste the files) into a new Repl.
2. Add `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` to **Secrets** (and optionally `GUILD_ID`).
3. Press **Run**. The bot logs in, registers commands, and stays online.
4. Data is stored in the `data/` folder as JSON files. Back up that folder to keep announcement history and settings.

To run locally instead: `npm install` then `npm start`. To (re-)register slash commands manually: `npm run register`.

## Project layout

```
index.js                      Entry point: wires client, database, services
src/config/                   Config, emoji map, visual theme
src/database/                 JSON-file stores + data layer
src/services/                 Broadcast engine, workflow, auth, audit, DM opt-ins
src/commands/                 Slash commands
src/interactions/             Buttons, modals, select menus, pagination
src/utils/                    Logging, formatting, validation, error handling
data/                         Created at runtime — all persistent data
```

## Notes on DM delivery

Unsolicited bulk DMs violate Discord's rules. DM delivery is off unless explicitly enabled in `/setup`, and even then the bot only messages members who personally opted in with `/announce-dm opt-in`. Blocked DMs and privacy settings are handled gracefully and counted as skips/failures in the delivery report.
