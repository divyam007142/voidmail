/**
 * Centralized visual identity shared by every embed in the bot:
 * brand colors, footer text, and helper factories so all embeds look
 * consistent regardless of which command produced them.
 */
const { emoji } = require('./emojis');

const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  info: 0x2b2d31,
  neutral: 0x2b2d31,
};

const FOOTER = 'Announcement System';

function baseEmbed(color = COLORS.primary) {
  return {
    color,
    footer: { text: `${FOOTER} ${emoji('SPARKLES')}`.trim() },
    timestamp: new Date().toISOString(),
  };
}

function embed(color, data = {}) {
  return { ...baseEmbed(color), ...data };
}

module.exports = { COLORS, FOOTER, baseEmbed, embed };
