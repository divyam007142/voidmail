/**
 * Shared embed factories. Every user-facing embed in the bot is built here
 * so colors, footers, timestamps, and layout stay consistent.
 */
const { EmbedBuilder } = require('discord.js');
const { emoji } = require('../config/emojis');
const { COLORS, embed } = require('../config/theme');

function panelEmbed() {
  return new EmbedBuilder(embed(COLORS.primary, {
    title: `${emoji('ANNOUNCEMENT')}  Announcement Center`,
    description: [
      `${emoji('SPARKLES')} **Professional server-wide announcements, delivered right.**`,
      '',
      `${emoji('INFO')} **How it works**`,
      '\u2500'.repeat(28),
      `${emoji('CREATE')} Press **Create Announcement** below.`,
      `${emoji('SETTINGS')} Fill in the title and description (a banner image and attachment are optional).`,
      `${emoji('DELIVERY')} Review a private preview of the exact announcement.`,
      `${emoji('SEND')} Confirm to broadcast it to the announcement channel.`,
      '',
      `${emoji('WARNING')} Announcements are posted publicly in the configured channel.`.trim(),
      `${emoji('CLOCK')} Previews expire after a few minutes if not confirmed.`,
    ].join('\n'),
    fields: [
      {
        name: `${emoji('DENIED')} Authorization`,
        value: `Only members with the administrator role may create or send announcements.`,
        inline: false,
      },
    ],
  }));
}

function previewEmbed({ title, description, bannerURL, creator, destination }) {
  const builder = new EmbedBuilder(embed(COLORS.warning, {
    title: `${emoji('DELIVERY')}  Announcement Preview`,
    description: [
      `${emoji('INFO')} This is exactly how your announcement will appear.`,
      '',
      '\u2500'.repeat(28),
      '',
      `**${title}**`,
      '',
      description.slice(0, 3500),
    ].join('\n'),
    fields: [
      { name: `${emoji('SERVER')} Destination`, value: destination, inline: true },
      { name: `${emoji('AUDIT')} Created by`, value: `<@${creator.id}>`, inline: true },
    ],
  }));

  if (bannerURL) builder.setImage(bannerURL);
  return builder;
}

function successEmbed(title, description) {
  return new EmbedBuilder(embed(COLORS.success, {
    title: `${emoji('SUCCESS')}  ${title}`,
    description,
  }));
}

function errorEmbed(title, description) {
  return new EmbedBuilder(embed(COLORS.danger, {
    title: `${emoji('ERROR')}  ${title}`,
    description,
  }));
}

function deniedEmbed(action) {
  return new EmbedBuilder(embed(COLORS.danger, {
    title: `${emoji('DENIED')}  Permission Denied`,
    description: [
      `You are not authorized to ${action}.`,
      '',
      `Required: the configured administrator role.`,
    ].join('\n'),
  }));
}

function infoEmbed(title, description) {
  return new EmbedBuilder(embed(COLORS.primary, {
    title: `${emoji('INFO')}  ${title}`,
    description,
  }));
}

module.exports = {
  panelEmbed,
  previewEmbed,
  successEmbed,
  errorEmbed,
  deniedEmbed,
  infoEmbed,
};
