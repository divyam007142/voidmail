/**
 * Registers slash commands with Discord.
 * Run once with `npm run register` (or automatically on startup when
 * commands are missing). Uses GUILD_ID for instant guild-scoped updates
 * when provided, otherwise registers globally.
 */
const { REST, Routes } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');

const commandData = [
  require('./panel').data.toJSON(),
  require('./setup').data.toJSON(),
  require('./stats').data.toJSON(),
  require('./announcement-history').data.toJSON(),
  require('./audit').data.toJSON(),
  require('./announce-dm').data.toJSON(),
];

async function deployCommands(clientId) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = commandData;

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, config.guildId), { body });
    logger.info(`Registered ${body.length} guild commands in ${config.guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    logger.info(`Registered ${body.length} global commands`);
  }
}

module.exports = { deployCommands, commandData };

if (require.main === module) {
  deployCommands(config.clientId).catch((error) => {
    logger.error('Command registration failed:', error.message);
    process.exit(1);
  });
}
