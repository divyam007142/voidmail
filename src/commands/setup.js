const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
} = require('discord.js');
const { emoji } = require('../config/emojis');
const { COLORS, embed } = require('../config/theme');
const { successEmbed } = require('../utils/embedFactory');
const { checkAuthorization } = require('../services/authorization');
const { respondWithError } = require('../utils/errorHandler');

const SETUP_PREFIX = 'setup:';

function configOverviewEmbed(guildConfig, guild) {
  const lines = (id) => (id ? `<#${id}>` : '*not configured*');
  return new EmbedBuilder(embed(COLORS.primary, {
    title: `${emoji('SETTINGS')}  Server Configuration`,
    description: 'Current settings for the announcement system in this server.',
    fields: [
      { name: `${emoji('ANNOUNCEMENT')} Panel channel`, value: lines(guildConfig?.panelChannelId), inline: true },
      { name: `${emoji('DELIVERY')} Announcement channel`, value: lines(guildConfig?.announcementChannelId), inline: true },
      { name: `${emoji('DENIED')} Authorized role`, value: guildConfig?.authorizedRoleId ? `<@&${guildConfig.authorizedRoleId}>` : (process.env.AUTHORIZED_ROLE_ID ? `<@&${process.env.AUTHORIZED_ROLE_ID}> (from environment)` : '*not configured*'), inline: true },
      { name: `${emoji('SPARKLES')} Announcement role (pinged)`, value: guildConfig?.announcementRoleId ? `<@&${guildConfig.announcementRoleId}>` : '*none — no ping sent*', inline: true },
      { name: `${emoji('SEND')} DM delivery for opted-in members`, value: guildConfig?.dmDeliveryEnabled ? 'Enabled' : 'Disabled', inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
    ],
    footer: { text: `${guild?.name ?? 'Server'} \u2022 Use the menu below to change a setting` },
    timestamp: new Date().toISOString(),
  }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the announcement system for this server.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, context) {
    const guildConfig = context.database.getGuildConfig(interaction.guildId);
    const auth = checkAuthorization(interaction, guildConfig, 'configure the announcement system');
    if (!auth.ok) {
      await interaction.reply({ ...auth.reply, ephemeral: true });
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${SETUP_PREFIX}select`)
      .setPlaceholder('Choose a setting to configure\u2026')
      .addOptions(
        {
          label: 'Panel channel',
          value: 'panel',
          description: 'Where the /panel announcement panel is posted',
          emoji: emoji('ANNOUNCEMENT'),
        },
        {
          label: 'Announcement channel',
          value: 'announcement',
          description: 'Where confirmed announcements are broadcast',
          emoji: emoji('DELIVERY'),
        },
        {
          label: 'Authorized role',
          value: 'role',
          description: 'Role allowed to create and send announcements',
          emoji: emoji('DENIED'),
        },
        {
          label: 'Announcement ping role',
          value: 'ping',
          description: 'Role mentioned with each announcement (optional)',
          emoji: emoji('SPARKLES'),
        },
        {
          label: 'Toggle DM delivery',
          value: 'dm',
          description: 'Deliver announcements by DM to opted-in members',
          emoji: emoji('SEND'),
        },
      );

    await interaction.reply({
      embeds: [configOverviewEmbed(guildConfig, interaction.guild)],
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true,
    });
  },
};

module.exports.SETUP_PREFIX = SETUP_PREFIX;
module.exports.configOverviewEmbed = configOverviewEmbed;
