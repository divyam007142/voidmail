/**
 * Authorization service.
 *
 * The authorized role ID can be configured per-guild through /setup, or
 * globally via the AUTHORIZED_ROLE_ID environment variable. Permission
 * is re-validated inside every interaction handler — never rely on
 * Discord's command visibility alone.
 */
const { EmbedBuilder } = require('discord.js');
const { emoji } = require('../config/emojis');
const { COLORS, embed } = require('../config/theme');
const config = require('../config');

function getAuthorizedRoleId(guildConfig) {
  return guildConfig?.authorizedRoleId ?? config.authorizedRoleId ?? null;
}

function hasAuthorizedRole(member, guildConfig) {
  if (!member) return false;
  // Guild owners always retain access.
  if (member.guild?.ownerId === member.id) return true;
  const roleId = getAuthorizedRoleId(guildConfig);
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}

function deniedReply(action) {
  return {
    embeds: [
      new EmbedBuilder(embed(COLORS.danger, {
        title: `${emoji('DENIED')}  Permission Denied`,
        description: `You are not authorized to ${action}.\n\nRequired: the configured administrator role.`,
      })),
    ],
    ephemeral: true,
  };
}

function checkAuthorization(interaction, guildConfig, action) {
  if (!hasAuthorizedRole(interaction.member, guildConfig)) {
    return { ok: false, reply: deniedReply(action) };
  }
  return { ok: true };
}

module.exports = {
  getAuthorizedRoleId,
  hasAuthorizedRole,
  checkAuthorization,
  deniedReply,
};
