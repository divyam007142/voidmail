/**
 * Announcement Bot — entry point.
 *
 * Boots the client, wires the database and services together, registers
 * event/interaction handling, and deploys slash commands on startup.
 */
require('dotenv').config();

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');
const { getDatabase } = require('./database');
const { BroadcastEngine } = require('./services/broadcastEngine');
const { AnnouncementService } = require('./services/announcementService');
const { AuditService } = require('./services/auditService');
const { DmOptInService } = require('./services/dmOptIn');
const { InteractionHandler } = require('./interactions/interactionHandler');
const { registerEvents } = require('./events');
const { deployCommands } = require('./deploy-commands');

// Fail fast with a readable message if credentials are missing.
if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
  // eslint-disable-next-line no-console
  console.error(
    'Missing DISCORD_TOKEN or DISCORD_CLIENT_ID.\n' +
    'Add them to your .env file locally or to Replit Secrets, then restart.',
  );
  process.exit(1);
}

logger.init(config.database.dataDir);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

const database = getDatabase();
const auditService = new AuditService(database);
const broadcastEngine = new BroadcastEngine({ database, client });
const announcementService = new AnnouncementService({ database, broadcastEngine, auditService });
const dmOptIn = new DmOptInService(database);

const commands = new Collection();
for (const name of ['panel', 'setup', 'stats', 'announcement-history', 'audit', 'announce-dm']) {
  commands.set(name, require(`./commands/${name}`));
}

const interactionHandler = new InteractionHandler({
  database,
  announcementService,
  broadcastEngine,
  dmOptIn,
  auditService,
  commands,
});

registerEvents(client, interactionHandler, database);

client.login(config.token).then(async () => {
  try {
    await deployCommands(config.clientId);
  } catch (error) {
    logger.error('Startup command registration failed (commands may already exist):', error.message);
  }
}).catch((error) => {
  logger.error('Login failed \u2014 check DISCORD_TOKEN:', error.message);
  process.exit(1);
});

module.exports = client;
