/**
 * Client event wiring: ready, interaction dispatch, and process-level
 * safety nets. Kept separate from index.js so the entry file stays small.
 */
const { Events, ActivityType } = require('discord.js');
const logger = require('../utils/logger');

function registerEvents(client, interactionHandler, database) {
  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`Logged in as ${readyClient.user.tag} (${readyClient.guilds.cache.size} server(s))`);
    readyClient.user.setActivity({
      name: '/panel \u2022 announcements',
      type: ActivityType.Watching,
    });
  });

  client.on(Events.InteractionCreate, (interaction) => {
    interactionHandler.handle(interaction).catch((error) => {
      logger.error('[interactionDispatch]', error);
    });
  });

  client.on(Events.Error, (error) => logger.error('[client]', error));
  client.on(Events.Warn, (message) => logger.warn('[client]', message));
  client.on(Events.ShardDisconnect, () => logger.warn('WebSocket disconnected \u2014 reconnecting\u2026'));

  process.on('SIGINT', () => {
    logger.info('Shutting down (SIGINT)\u2026');
    try {
      database.flushAll();
    } finally {
      client.destroy();
      process.exit(0);
    }
  });

  process.on('SIGTERM', () => {
    logger.info('Shutting down (SIGTERM)\u2026');
    try {
      database.flushAll();
    } finally {
      client.destroy();
      process.exit(0);
    }
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('[unhandledRejection]', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('[uncaughtException]', error);
  });
}

module.exports = { registerEvents };
