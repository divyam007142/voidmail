/**
 * Centralized error handling.
 *
 * Converts any thrown error (Discord API, database, network, workflow)
 * into (a) a diagnostic log entry with context and (b) a safe, generic
 * user-facing response. Sensitive details never reach end users.
 */
const { EmbedBuilder } = require('discord.js');
const { emoji } = require('./emojis');
const { COLORS, embed } = require('./theme');
const logger = require('./logger');

const ERROR_CODES = {
  APPLICATION_TOKEN_INVALID: 'The bot token is invalid. Check DISCORD_TOKEN.',
  MissingPermissions: 'The bot is missing permissions in that channel.',
  CHANNEL_NOT_FOUND: 'The configured channel could not be found.',
  ROLE_NOT_FOUND: 'The configured role could not be found.',
  DATABASE_UNAVAILABLE: 'The storage layer is temporarily unavailable.',
};

function logError(context, error) {
  const diagnostics = {
    context,
    name: error?.name,
    code: error?.code,
    status: error?.status,
    method: error?.method,
    url: error?.url,
    message: error?.message,
  };
  logger.error(`[${context}]`, diagnostics);
  if (error?.stack && process.env.LOG_LEVEL === 'debug') {
    logger.debug(error.stack);
  }
}

function publicMessage(error) {
  if (!error) return 'An unexpected error occurred. Please try again later.';
  if (error.userMessage) return error.userMessage;
  const mapped = ERROR_CODES[error.code] ?? ERROR_CODES[error.name];
  return mapped ?? 'An unexpected error occurred. Please try again later.';
}

function errorEmbedFor(error) {
  return new EmbedBuilder(embed(COLORS.danger, {
    title: `${emoji('ERROR')}  Something Went Wrong`,
    description: publicMessage(error),
  }));
}

/**
 * Safely responds to an interaction with the error, falling back to
 * followUp when the original response was already used, and swallowing
 * "already acknowledged" style failures.
 */
async function respondWithError(interaction, context, error) {
  logError(context, error);
  const payload = { embeds: [errorEmbedFor(error)], ephemeral: true };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else if (interaction.isRepliable?.()) {
      await interaction.reply(payload).catch(() => {});
    }
  } catch (replyError) {
    logError(`${context}/errorReply`, replyError);
  }
}

class UserInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserInputError';
    this.userMessage = message;
  }
}

class DuplicateAnnouncementError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DuplicateAnnouncementError';
    this.userMessage = message;
  }
}

module.exports = {
  logError,
  respondWithError,
  publicMessage,
  errorEmbedFor,
  UserInputError,
  DuplicateAnnouncementError,
};
