const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { emoji } = require('../config/emojis');
const { COLORS, embed } = require('../config/theme');
const { truncate, formatPercent, formatDuration, discordTimestamp } = require('../utils/formatters');
const { respondWithError } = require('../utils/errorHandler');
const { checkAuthorization } = require('../services/authorization');

const PAGE_SIZE = 5;
const PREFIX = 'history:';

const STATUS_LABELS = {
  completed: 'Completed',
  failed: 'Failed',
  processing: 'In progress',
  pending: 'Pending',
  cancelled: 'Cancelled',
};

function statusColor(status) {
  switch (status) {
    case 'completed': return COLORS.success;
    case 'failed': return COLORS.danger;
    case 'processing':
    case 'pending': return COLORS.warning;
    default: return COLORS.neutral;
  }
}

function historyEmbed(items, { page, totalPages, total, filter, authorized }) {
  const lines = items.map((announcement) => {
    const report = announcement.report ?? {};
    const deliveryRate = report.eligibleCount > 0
      ? formatPercent(report.successCount, report.eligibleCount)
      : (announcement.deliveryMode === 'channel' ? (announcement.status === 'completed' ? '100%' : '—') : '—');
    return [
      `\`${announcement.id}\` \u2022 **${STATUS_LABELS[announcement.status] ?? announcement.status}**`,
      `${truncate(announcement.title, 80)}`,
      `${discordTimestamp(announcement.createdAt, 'R')} \u2022 Delivery: ${deliveryRate}` +
        (report.eligibleCount > 0 ? ` (${report.successCount}/${report.eligibleCount})` : ''),
    ].join('\n');
  });

  return new EmbedBuilder(embed(filter === 'all' ? COLORS.neutral : statusColor(filter), {
    title: `${emoji('HISTORY')}  Announcement History`,
    description: lines.length > 0 ? lines.join('\n\n') : 'No announcements found for this filter.',
    fields: [
      { name: `${emoji('INFO')} Page`, value: `${page + 1} / ${Math.max(1, totalPages)} (${total} total)`, inline: true },
      { name: `${emoji('SETTINGS')} Filter`, value: STATUS_LABELS[filter] ?? 'All', inline: true },
      { name: `${emoji('DENIED')} Access`, value: authorized ? 'Administrator (full detail)' : 'Standard', inline: true },
    ],
  }));
}

function historyComponents(page, totalPages, filter, authorized) {
  const rows = [];
  const filterMenu = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}filter`)
    .setPlaceholder('Filter announcements\u2026')
    .addOptions(
      { label: 'All announcements', value: 'all', default: filter === 'all', emoji: emoji('HISTORY') },
      { label: 'Completed', value: 'completed', default: filter === 'completed', emoji: emoji('SUCCESS') },
      { label: 'Failed', value: 'failed', default: filter === 'failed', emoji: emoji('ERROR') },
      { label: 'In progress', value: 'processing', default: filter === 'processing', emoji: emoji('CLOCK') },
    );
  rows.push(new ActionRowBuilder().addComponents(filterMenu));

  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${PREFIX}first:${page}:${filter}`).setEmoji(emoji('FIRST_PAGE')).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${PREFIX}prev:${page}:${filter}`).setEmoji(emoji('PREVIOUS')).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${PREFIX}next:${page}:${filter}`).setEmoji(emoji('NEXT')).setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
      new ButtonBuilder().setCustomId(`${PREFIX}last:${page}:${filter}`).setEmoji(emoji('LAST_PAGE')).setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    ));
  }
  return rows;
}

function buildHistoryPayload(context, { filter, page, authorized }) {
  const result = context.database.listAnnouncements({
    status: filter === 'all' ? undefined : filter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  // Attach delivery reports for display.
  const items = result.items.map((announcement) => ({
    ...announcement,
    report: context.database.getDeliveryReport(announcement.id),
  }));

  const totalPages = Math.ceil(result.total / PAGE_SIZE);
  return {
    embeds: [historyEmbed(items, { page, totalPages, total: result.total, filter, authorized })],
    components: historyComponents(page, totalPages, filter, authorized),
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announcement-history')
    .setDescription('View previous announcements with delivery results.')
    .setDMPermission(false),

  async execute(interaction, context) {
    try {
      const guildConfig = context.database.getGuildConfig(interaction.guildId);
      const auth = checkAuthorization(interaction, guildConfig, 'view restricted announcement records');
      const authorized = auth.ok;
      if (!authorized) {
        // Non-administrators receive a clean permission-denied notice; the
        // restricted records require the administrator role.
        await interaction.reply({
          ...auth.reply,
          ephemeral: true,
        });
        return;
      }

      const payload = buildHistoryPayload(context, { filter: 'all', page: 0, authorized });
      payload.ephemeral = true;
      await interaction.reply(payload);
    } catch (error) {
      await respondWithError(interaction, 'announcement-history.execute', error);
    }
  },
};

module.exports.PREFIX = PREFIX;
module.exports.PAGE_SIZE = PAGE_SIZE;
module.exports.buildHistoryPayload = buildHistoryPayload;
module.exports.STATUS_LABELS = STATUS_LABELS;
