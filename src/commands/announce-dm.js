const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { emoji } = require('../config/emojis');
const { COLORS, embed } = require('../config/theme');
const { successEmbed, errorEmbed } = require('../utils/embedFactory');
const { respondWithError } = require('../utils/errorHandler');
const { checkAuthorization } = require('../services/authorization');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce-dm')
    .setDescription('Manage your personal announcement DM delivery preference.')
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName('preference')
      .setDescription('Receive announcement DMs for this server?')
      .setRequired(true)
      .addChoices(
        { name: 'Opt in \u2014 send me announcement DMs', value: 'opt-in' },
        { name: 'Opt out \u2014 stop announcement DMs', value: 'opt-out' },
      )),

  async execute(interaction, context) {
    try {
      const preference = interaction.options.getString('preference', true);

      if (preference === 'opt-in') {
        context.dmOptIn.optIn(interaction.guildId, interaction.user.id);
        await interaction.reply({
          embeds: [successEmbed(
            'DM Delivery Enabled',
            'You will now receive announcement DMs from this server when the staff choose DM delivery.\n\nYou can opt out at any time with `/announce-dm opt-out`.',
          )],
          ephemeral: true,
        });
        return;
      }

      context.dmOptIn.optOut(interaction.guildId, interaction.user.id);
      await interaction.reply({
        embeds: [successEmbed(
          'DM Delivery Disabled',
          'You will no longer receive announcement DMs from this server.',
        )],
        ephemeral: true,
      });
    } catch (error) {
      await respondWithError(interaction, 'announce-dm.execute', error);
    }
  },
};
