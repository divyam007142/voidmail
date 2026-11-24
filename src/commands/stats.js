const os = require('os');
const {
  SlashCommandBuilder,
  version: discordJsVersion,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { emoji } = require('../config/emojis');
const { COLORS, embed } = require('../config/theme');
const { formatDuration, formatBytes, discordTimestamp } = require('../utils/formatters');
const { respondWithError } = require('../utils/errorHandler');
const { checkAuthorization } = require('../services/authorization');

function statLine(label, value) {
  return `${label}: ${value}`;
}

function buildStatsEmbeds(context, interaction) {
  const client = interaction.client;
  const now = Date.now();

  // --- Bot information ---
  const wsLatency = client.ws?.ping >= 0 ? `${Math.round(client.ws.ping)}ms` : 'measuring\u2026';
  const restLatency = Math.max(0, now - interaction.createdTimestamp);
  const status = client.ws?.status === 0 ? 'Ready' : `State ${client.ws?.status}`;

  const botEmbed = new EmbedBuilder(embed(COLORS.primary, {
    title: `${emoji('STATISTICS')}  Bot Statistics`,
    thumbnail: client.user?.displayAvatarURL() ? { url: client.user.displayAvatarURL() } : undefined,
    fields: [
      {
        name: `${emoji('INFO')} Bot Information`,
        value: [
          statLine(`${emoji('AUDIT')} Username`, `**${client.user?.tag ?? 'unknown'}**`),
          statLine(`${emoji('SETTINGS')} Bot ID`, `\`${client.user?.id ?? 'unknown'}\``),
          statLine(`${emoji('CLOCK')} Uptime`, formatDuration(process.uptime() * 1000)),
          statLine(`${emoji('SPARKLES')} Created`, discordTimestamp(client.user?.createdAt ?? Date.now(), 'R')),
          statLine(`${emoji('DELIVERY')} REST latency`, `${restLatency}ms`),
          statLine(`${emoji('SERVER')} WebSocket latency`, wsLatency),
          statLine(`${emoji('SUCCESS')} Status`, status),
        ].join('\n'),
        inline: false,
      },
    ],
  }));

  // --- System information (real process metrics) ---
  const memory = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const cpuPercent = process.uptime() > 0
    ? ((cpuUsage.user + cpuUsage.system) / 1000 / (process.uptime() * 1000) * 100)
    : 0;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  const systemEmbed = new EmbedBuilder(embed(COLORS.info, {
    title: `${emoji('SERVER')}  System Information`,
    fields: [
      {
        name: 'Process metrics (this bot)',
        value: [
          statLine(`${emoji('WARNING')} CPU (process, avg)`, `${Math.min(100, cpuPercent).toFixed(1)}%`),
          statLine(`${emoji('DELIVERY')} RSS memory`, formatBytes(memory.rss)),
          statLine(`${emoji('INFO')} Heap used`, formatBytes(memory.heapUsed)),
          statLine(`${emoji('INFO')} Heap total`, formatBytes(memory.heapTotal)),
          statLine(`${emoji('SETTINGS')} Node.js`, process.version),
          statLine(`${emoji('SPARKLES')} discord.js`, `v${discordJsVersion}`),
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Host metrics (shared on Replit)',
        value: [
          statLine(`${emoji('SERVER')} Operating system`, `${os.type()} ${os.release()} (${os.arch()})`),
          statLine(`${emoji('INFO')} Host memory free`, `${formatBytes(freeMem)} / ${formatBytes(totalMem)}`),
          statLine(`${emoji('CLOCK')} Host uptime`, formatDuration(os.uptime() * 1000)),
        ].join('\n'),
        inline: false,
      },
    ],
    footer: { text: 'Process metrics reflect this bot only \u2022 host metrics cover the whole machine' },
  }));

  // --- Bot statistics ---
  const stats = context.database.getStats();
  const totalCommands = context.commands?.size ?? 0;
  const totalChannels = client.guilds.cache.reduce((sum, guild) => sum + (guild.channels.cache.size ?? 0), 0);
  const cachedUsers = client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount ?? 0), 0);

  const statsEmbed = new EmbedBuilder(embed(COLORS.neutral, {
    title: `${emoji('ANNOUNCEMENT')}  Announcement Statistics`,
    fields: [
      {
        name: 'Reach',
        value: [
          statLine(`${emoji('SERVER')} Servers`, client.guilds.cache.size),
          statLine(`${emoji('AUDIT')} Cached members (approx.)`, cachedUsers),
          statLine(`${emoji('DELIVERY')} Channels`, totalChannels),
          statLine(`${emoji('CREATE')} Slash commands`, totalCommands),
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Announcements',
        value: [
          statLine(`${emoji('ANNOUNCEMENT')} Total`, stats.totalAnnouncements),
          statLine(`${emoji('SUCCESS')} Successful`, stats.completed),
          statLine(`${emoji('ERROR')} Failed`, stats.failed),
          statLine(`${emoji('CLOCK')} In progress`, stats.pendingOrProcessing),
        ].join('\n'),
        inline: false,
      },
    ],
  }));

  return [botEmbed, systemEmbed, statsEmbed];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View the bot statistics dashboard.'),

  async execute(interaction, context) {
    try {
      await interaction.reply({
        embeds: buildStatsEmbeds(context, interaction),
        ephemeral: true,
      });
    } catch (error) {
      await respondWithError(interaction, 'stats.execute', error);
    }
  },
};
