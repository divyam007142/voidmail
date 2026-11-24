const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { emoji } = require('../config/emojis');
const { panelEmbed, successEmbed, errorEmbed } = require('../utils/embedFactory');
const { checkAuthorization } = require('../services/authorization');
const { respondWithError } = require('../utils/errorHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the announcement panel in the configured panel channel.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, context) {
    const guildConfig = context.database.getGuildConfig(interaction.guildId);
    const auth = checkAuthorization(interaction, guildConfig, 'post the announcement panel');
    if (!auth.ok) {
      await interaction.reply({ ...auth.reply, ephemeral: true });
      return;
    }

    const panelChannelId = guildConfig?.panelChannelId;
    const targetChannel = panelChannelId
      ? interaction.guild.channels.cache.get(panelChannelId)
      : interaction.channel;

    if (!targetChannel) {
      await interaction.reply({
        embeds: [errorEmbed(
          'Panel Channel Missing',
          `The configured panel channel (<#${panelChannelId}>) could not be found.\n\nUse ${'/setup'} to choose a valid channel first.`,
        )],
        ephemeral: true,
      });
      return;
    }

    const me = interaction.guild.members.me;
    if (!targetChannel.permissionsFor(me)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      await interaction.reply({
        embeds: [errorEmbed(
          'Missing Permissions',
          `I need **View Channel**, **Send Messages**, and **Embed Links** in <#${targetChannel.id}> to post the panel.`,
        )],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const panelPayload = {
        embeds: [panelEmbed()],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('announce:open')
              .setLabel('Create Announcement')
              .setEmoji(emoji('CREATE'))
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      };

      const message = await targetChannel.send(panelPayload);

      context.database.upsertGuildConfig(interaction.guildId, {
        panelChannelId: targetChannel.id,
        panelMessageId: message.id,
      });
      context.database.appendAuditLog({
        actorId: interaction.user.id,
        action: 'PANEL_POSTED',
        guildId: interaction.guildId,
        metadata: { channelId: targetChannel.id, messageId: message.id },
      });

      await interaction.editReply({
        embeds: [successEmbed(
          'Panel Posted',
          `The announcement panel is now live in <#${targetChannel.id}>.\n\nIt remains fully functional across bot restarts.`,
        )],
      });
    } catch (error) {
      await respondWithError(interaction, 'panel.execute', error);
    }
  },
};
