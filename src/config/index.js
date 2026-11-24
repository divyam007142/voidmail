/**
 * Central application configuration.
 * All values are read from environment variables so they can live in
 * Replit Secrets / a local .env file. Never hardcode tokens here.
 */
require('dotenv').config();

const path = require('path');

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name, fallback) {
  return process.env[name] ?? fallback;
}

const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: optional('GUILD_ID', null),

  // Slash commands are registered globally unless a GUILD_ID is provided.
  registerGlobally: !process.env.GUILD_ID,

  // Hardcoded role that may create and send announcements. Can be
  // overridden per-guild via /setup.
  authorizedRoleId: optional('AUTHORIZED_ROLE_ID', null),

  database: {
    dataDir: optional('DATA_DIR', path.join(process.cwd(), 'data')),
    saveDebounceMs: 750,
  },

  announcements: {
    maxTitleLength: 256,
    maxDescriptionLength: 4000,
    maxBannerSize: 8 * 1024 * 1024,
    maxAttachmentSize: 25 * 1024 * 1024,
    allowedImageExtensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    allowedMediaExtensions: [
      '.png', '.jpg', '.jpeg', '.gif', '.webp',
      '.mp4', '.webm', '.mov', '.ogg', '.mp3', '.wav',
    ],
    dmDelivery: {
      enabled: false,
      batchSize: 5,
      batchPauseMs: 2000,
      maxRetries: 2,
      retryBaseDelayMs: 1500,
      maxRetryAfterMs: 60_000,
      maxFailuresBeforeAbort: 25,
    },
    maxPendingWorkflowAgeMs: 30 * 60 * 1000,
  },
};

module.exports = config;
