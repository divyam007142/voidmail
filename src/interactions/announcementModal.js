/**
 * The announcement creation modal.
 *
 * Discord modals do not support file upload components in the current
 * API, so the attachment field accepts a direct media URL instead. The
 * URL is validated (format + embeddability) before the preview is shown.
 */
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { emoji } = require('../../config/emojis');

const FIELDS = {
  TITLE: 'announceTitle',
  DESCRIPTION: 'announceDescription',
  BANNER: 'announceBanner',
  ATTACHMENT: 'announceAttachment',
};

function buildAnnouncementModal() {
  const title = new TextInputBuilder()
    .setCustomId(FIELDS.TITLE)
    .setLabel('Announcement title')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(200)
    .setPlaceholder('What is this announcement about?')
    .setRequired(true);

  const description = new TextInputBuilder()
    .setCustomId(FIELDS.DESCRIPTION)
    .setLabel('Announcement description')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(3800)
    .setPlaceholder('Write the full announcement text here\u2026')
    .setRequired(true);

  const banner = new TextInputBuilder()
    .setCustomId(FIELDS.BANNER)
    .setLabel('Banner image URL (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('https://example.com/banner.png');

  const attachment = new TextInputBuilder()
    .setCustomId(FIELDS.ATTACHMENT)
    .setLabel('Attachment URL \u2014 image/video (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('https://example.com/video.mp4');

  return new ModalBuilder()
    .setCustomId('announcementModal')
    .setTitle('Create Announcement')
    .addComponents(
      new ActionRowBuilder().addComponents(title),
      new ActionRowBuilder().addComponents(description),
      new ActionRowBuilder().addComponents(banner),
      new ActionRowBuilder().addComponents(attachment),
    );
}

function extractModalFields(interaction) {
  return {
    title: interaction.fields.getTextInputValue(FIELDS.TITLE),
    description: interaction.fields.getTextInputValue(FIELDS.DESCRIPTION),
    bannerURL: interaction.fields.getTextInputValue(FIELDS.BANNER)?.trim() || null,
    attachmentURL: interaction.fields.getTextInputValue(FIELDS.ATTACHMENT)?.trim() || null,
  };
}

module.exports = { buildAnnouncementModal, extractModalFields, FIELDS };
