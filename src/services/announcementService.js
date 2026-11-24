/**
 * Announcement workflow service.
 *
 * Manages the stateful create → preview → confirm/cancel flow:
 *  - Builds previews with creator-scoped buttons.
 *  - Enforces duplicate protection (content fingerprint + pending state).
 *  - Confirms broadcasts and records audit entries.
 *  - Restores pending workflows after a restart (buttons stay functional).
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { emoji } = require('../config/emojis');
const { COLORS, embed } = require('../config/theme');
const { previewEmbed, successEmbed, errorEmbed } = require('../utils/embedFactory');
const { broadcastEmbed } = require('./broadcastEngine');
const logger = require('../utils/logger');

const WORKFLOW_TTL_MS = 15 * 60 * 1000;

function buildPreviewButtons(creatorId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`announce:send:${creatorId}`)
        .setLabel('Send Announcement')
        .setEmoji(emoji('SEND'))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`announce:cancel:${creatorId}`)
        .setLabel('Cancel')
        .setEmoji(emoji('CANCEL'))
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildPreviewPayload({ title, description, bannerURL, attachment, creator, destinationLabel }) {
  const preview = previewEmbed({
    title,
    description,
    bannerURL,
    creator,
    destination: destinationLabel,
  });

  if (attachment?.url) {
    // Show the attachment in the preview via an additional embed so the
    // administrator sees exactly what will be delivered.
    preview.addFields({
      name: `${emoji('DELIVERY')} Attachment`,
      value: `[${attachment.name}](${attachment.url})`,
      inline: false,
    });
  }

  return {
    embeds: [preview],
    components: buildPreviewButtons(creator.id),
    ephemeral: true,
  };
}

function isWorkflowExpired(workflow) {
  return Date.now() - new Date(workflow.createdAt).getTime() > WORKFLOW_TTL_MS;
}

class AnnouncementService {
  constructor({ database, broadcastEngine, auditService }) {
    this.db = database;
    this.engine = broadcastEngine;
    this.audit = auditService;
  }

  /**
   * Validates and stages a new announcement from a modal submission.
   * Throws a UserInputError-style Error with `userMessage` on validation
   * failure or duplicate detection.
   */
  async stageAnnouncement({ title, description, bannerURL, attachment, creator, guildId, destinationLabel, deliveryMode = 'channel' }) {
    const contentFingerprint = this.db.fingerprintContent({ title, description, bannerURL, attachment });

    const duplicate = this.db.findRecentByFingerprint(contentFingerprint);
    if (duplicate) {
      const error = new Error('Duplicate announcement');
      error.userMessage = [
        `An identical announcement was created recently (\`${duplicate.id}\`, status: **${duplicate.status}**).`,
        '',
        'If you intentionally want to send the same content again, wait a few minutes or start a fresh workflow — new announcements are never permanently blocked.',
      ].join('\n');
      error.code = 'DUPLICATE_ANNOUNCEMENT';
      throw error;
    }

    const announcement = this.db.createAnnouncement({
      title,
      description,
      bannerURL,
      attachment,
      creatorId: creator.id,
      guildId,
      contentFingerprint,
      destination: destinationLabel,
      deliveryMode,
    });

    this.audit.log({
      actorId: creator.id,
      action: 'ANNOUNCEMENT_STAGED',
      announcementId: announcement.id,
      guildId,
      metadata: { title, deliveryMode },
    });

    return announcement;
  }

  /**
   * Confirms and broadcasts a staged announcement.
   * Only the creator may confirm (checked by caller via customId suffix).
   */
  async confirmAndSend(interaction, announcementId) {
    const announcement = this.db.getAnnouncement(announcementId);
    if (!announcement) {
      throw Object.assign(new Error('Announcement not found'), {
        userMessage: 'That announcement could no longer be found. It may have been cancelled.',
      });
    }

    if (announcement.status === 'processing') {
      throw Object.assign(new Error('Broadcast in progress'), {
        userMessage: `Announcement \`${announcementId}\` is already being delivered right now.`,
      });
    }

    if (['completed', 'cancelled'].includes(announcement.status)) {
      throw Object.assign(new Error('Announcement already finalized'), {
        userMessage: `Announcement \`${announcementId}\` was already ${announcement.status}. Create a new announcement to send another.`,
      });
    }

    const guild = interaction.guild;
    const delivered = await this.engine.broadcast({
      announcement,
      actorId: interaction.user.id,
      deliveryMode: announcement.deliveryMode,
    });

    return { announcement: delivered, guild };
  }

  cancel(announcementId, actorId) {
    const announcement = this.db.getAnnouncement(announcementId);
    if (!announcement) return null;
    if (announcement.status === 'processing') {
      const error = new Error('Cannot cancel in-flight broadcast');
      error.userMessage = 'That announcement is currently being delivered and can no longer be cancelled.';
      throw error;
    }
    if (['completed', 'cancelled'].includes(announcement.status)) return announcement;

    this.db.setAnnouncementStatus(announcementId, 'cancelled');
    this.audit.log({
      actorId,
      action: 'ANNOUNCEMENT_CANCELLED',
      announcementId,
      guildId: announcement.guildId,
    });
    return this.db.getAnnouncement(announcementId);
  }

  /** Final result card sent to the administrator after a broadcast. */
  resultEmbed(announcement) {
    const report = this.db.getDeliveryReport(announcement.id);
    const lines = [
      `${emoji('INFO')} Announcement ID: \`${announcement.id}\``,
      `${emoji('SERVER')} Destination: ${announcement.destination ?? 'announcement channel'}`,
    ];
    if (report) {
      lines.push(
        `${emoji('SUCCESS')} Delivered: **${report.successCount}**`,
        `${emoji('ERROR')} Failed: **${report.failedCount}**`,
        `${emoji('WARNING')} Skipped: **${report.skippedCount}**`,
      );
      if (Object.keys(report.failureCategories ?? {}).length > 0) {
        const breakdown = Object.entries(report.failureCategories)
          .map(([category, count]) => `${category}: ${count}`)
          .join(', ');
        lines.push(`${emoji('AUDIT')} Failure detail: ${breakdown}`);
      }
    }

    const succeeded = announcement.status === 'completed';
    return new EmbedBuilder(embed(succeeded ? COLORS.success : COLORS.danger, {
      title: succeeded
        ? `${emoji('SUCCESS')}  Announcement Delivered`
        : `${emoji('ERROR')}  Announcement Failed`,
      description: lines.join('\n'),
    }));
  }
}

module.exports = { AnnouncementService, buildPreviewPayload, buildPreviewButtons, isWorkflowExpired, WORKFLOW_TTL_MS };
