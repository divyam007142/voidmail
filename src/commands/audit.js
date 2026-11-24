const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { emoji } = require('../config/emojis');
const { COLORS, embed } = require('../config/theme');
const { truncate, discordTimestamp } = require('../utils/formatters');
const { respondWithError } = require('../utils/errorHandler');
const { checkAuthorization } = require('../services/authorization');

const PAGE_SIZE = 5;
const PREFIX = 'audit:';

const ACTION_LABELS = {
  ANNOUNCEMENT_STAGED: 'Announcement staged',
  ANNOUNCEMENT_BROADCAST: 'Announcement sent',
  ANNOUNCEMENT_CANCELLED: 'Announcement cancelled',
  PANEL_POSTED: 'Panel posted',
  CONFIG_UPDATED: 'Configuration changed',
  BROADCAST_CHANNEL_MISSING: 'Broadcast failed \u2014 channel missing',
};

function auditEmbed(entries, { page, totalPages, total }) {
  const lines = entries.map((entry) => {
    const meta = entry.metadata ?? {};
    const detailParts = [];
    if (meta.mode) detailParts.push(`mode: ${meta.mode}`);
    if (meta.status) detailParts.push(`status: ${meta.status}`);
    if (typeof meta.success === 'number') detailParts.push(`delivered: ${meta.success}`);
    if (typeof meta.failed === 'number' && meta.failed > 0) detailParts.push(`failed: ${meta.failed}`);
    if (meta.channelId) detailParts.push(`channel: <#${meta.channelId}>`);
    if (meta.title) detailParts.push(`"${truncate(meta.title, 60)}"`);
    const detail = detailParts.length > 0 ? `\n\u21B3 ${detailParts.join(' \u2022 ')}` : '';

    return [
      `\`${entry.id}\` \u2022 **${ACTION_LABELS[entry.action] ?? entry.action}**`,
      `${emoji('AUDIT')} Actor: <@${entry.actorId}> \u2022 ${discordTimestamp(entry.timestamp, 'f')}`,
      entry.announcementId ? `${emoji('ANNOUNCEMENT')} Announcement: \`${entry.announcementId}\`` : null,
      detail,
    ].filter(Boolean).join('\n');
  });

  return new EmbedBuilder(embed(COLORS.neutral, {
    title: `${emoji('AUDIT')}  Administrative Audit Log`,
    description: lines.length > 0 ? lines.join('\n\n') : 'No audit records found.',
    fields: [
      { name: `${emoji('INFO')} Page`, value: `${page + 1} / ${Math.max(1, totalPages)}`, inline: true },
      { name: `${emoji('HISTORY')} Total records`, value: String(total), inline: true },
    ],
    footer: { text: 'Audit records are permanent and cannot be edited through commands.' },
  }));
}

function buildAuditPayload(context, { page, announcementId = null }) {
  const result = context.database.listAuditLogs({
    announcementId,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const totalPages = Math.ceil(result.total / PAGE_SIZE);

  const components = [];
  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PREFIX}first:${page}`).setEmoji(emoji('FIRST_PAGE')).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${PREFIX}prev:${page}`).setEmoji(emoji('PREVIOUS')).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${PREFIX}next:${page}`).setEmoji(emoji('NEXT')).setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
      new ButtonBuilder().setCustomId(`${PREFIX}last:${page}`).setEmoji(emoji('LAST_PAGE')).setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    ));
  }

  return {
    embeds: [auditEmbed(result.items, { page, totalPages, total: result.total })],
    components,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('View the administrative audit log (restricted).')
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName('announcement-id')
      .setDescription('Filter the audit log by announcement ID')
      .setRequired(false)),

  async execute(interaction, context) {
    try {
      const guildConfig = context.database.getGuildConfig(interaction.guildId);
      const auth = checkAuthorization(interaction, guildConfig, 'view the audit log');
      if (!auth.ok) {
        await interaction.reply({ ...auth.reply, ephemeral: true });
        return;
      }

      const announcementId = interaction.options.getString('announcement-id')?.trim() || null;
      const payload = buildAuditPayload(context, { page: 0, announcementId });
      payload.ephemeral = true;
      await interaction.reply(payload);
    } catch (error) {
      await respondWithError(interaction, 'audit.execute', error);
    }
  },
};

module.exports.PREFIX = PREFIX;
module.exports.PAGE_SIZE = PAGE_SIZE;
module.exports.buildAuditPayload = buildAuditPayload;
