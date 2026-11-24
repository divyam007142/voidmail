/**
 * Announcement broadcast engine.
 *
 * Responsibilities:
 *  - Deliver a confirmed announcement to the configured announcement
 *    channel (server-wide mode).
 *  - Optionally DM the announcement, ONLY to members who have explicitly
 *    opted in through /announce-dm opt-in. Never mass-DM unrequested.
 *  - Respect Discord rate limits (429 handling, Retry-After, pacing).
 *  - Record delivery reports and audit log entries.
 *  - Prevent duplicate concurrent broadcasts.
 */
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { emoji } = require('../config/emojis');
const { COLORS, embed } = require('../config/theme');
const config = require('../config');
const logger = require('../utils/logger');

const DELIVERY_FAILURE_CATEGORIES = {
  DM_CLOSED: 'DMs closed or blocked',
  UNKNOWN_USER: 'Unknown user',
  RATE_LIMITED: 'Rate limited (gave up after retries)',
  MISSING_PERMISSIONS: 'Bot missing permissions',
  CHANNEL_MISSING: 'Announcement channel missing',
  NETWORK: 'Network failure',
  OTHER: 'Other error',
};

function broadcastEmbed(announcement, guild) {
  const builder = new EmbedBuilder(embed(COLORS.primary, {
    title: announcement.title,
    description: announcement.description,
    author: {
      name: `Announcement by ${announcement.creatorTag ?? 'the staff team'}`,
      iconURL: announcement.creatorAvatar ?? undefined,
    },
    footer: { text: `${guild?.name ?? 'Announcements'} \u2022 Announcement ID: ${announcement.id}` },
    timestamp: new Date(announcement.createdAt).toISOString(),
  }));

  if (announcement.bannerURL) builder.setImage(announcement.bannerURL);
  return builder;
}

function buildAttachment(announcement) {
  if (!announcement.attachment?.url) return null;
  try {
    return new AttachmentBuilder(announcement.attachment.url, { name: announcement.attachment.name });
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRetryAfterMs(error) {
  // discord.js exposes retryAfter in ms on rate limit errors.
  if (error?.retryAfter && Number.isFinite(error.retryAfter)) return error.retryAfter;
  const raw = error?.headers?.get?.('retry-after') ?? error?.rawError?.retry_after;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  return null;
}

function isRateLimitError(error) {
  return error?.status === 429 || error?.code === 500 || /rate\s?limit/i.test(error?.message ?? '');
}

function isPermanentFailure(error) {
  const permanentCodes = new Set([
    403, // missing access / DMs disabled
    404, // unknown channel / user
    50007, // cannot send messages to this user
    50001, // missing access
    50013, // missing permissions
  ]);
  return permanentCodes.has(error?.code) || [403, 404].includes(error?.status);
}

class BroadcastEngine {
  constructor({ database, client }) {
    this.db = database;
    this.client = client;
    /** Announcement IDs currently being broadcast (duplicate guard). */
    this.inFlight = new Set();
  }

  isBroadcasting(announcementId) {
    return this.inFlight.has(announcementId);
  }

  categorizeFailure(error) {
    if (isRateLimitError(error)) return 'RATE_LIMITED';
    switch (error?.code) {
      case 50007: return 'DM_CLOSED';
      case 50001:
      case 50013: return 'MISSING_PERMISSIONS';
      case 10003: return 'CHANNEL_MISSING';
      default:
        if (error?.status === 404) return 'UNKNOWN_USER';
        if (error?.status === 0 || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT') return 'NETWORK';
        return 'OTHER';
    }
  }

  /**
   * Sends one message with retry on rate limits only.
   * Returns { ok, category } — category is set on failure.
   */
  async sendWithRetry(target, payload, announcementId) {
    const settings = config.announcements.dmDelivery;
    let attempt = 0;
    for (;;) {
      try {
        await target.send(payload);
        return { ok: true };
      } catch (error) {
        if (isPermanentFailure(error)) {
          return { ok: false, category: this.categorizeFailure(error), error };
        }
        if (isRateLimitError(error) && attempt < settings.maxRetries) {
          const retryAfter = extractRetryAfterMs(error) ?? settings.retryBaseDelayMs * 2 ** attempt;
          const capped = Math.min(retryAfter, settings.maxRetryAfterMs);
          logger.warn(`Broadcast ${announcementId}: rate limited, retrying in ${capped}ms (attempt ${attempt + 1})`);
          await sleep(capped);
          attempt += 1;
          continue;
        }
        return { ok: false, category: this.categorizeFailure(error), error };
      }
    }
  }

  /**
   * Main entry point for a confirmed broadcast.
   * Returns the updated announcement record.
   */
  async broadcast({ announcement, actorId, deliveryMode }) {
    if (this.inFlight.has(announcement.id)) {
      throw Object.assign(new Error('Broadcast already in progress'), { userMessage: 'That announcement is already being delivered.' });
    }
    this.inFlight.add(announcement.id);
    try {
      const mode = deliveryMode ?? announcement.deliveryMode ?? 'channel';
      const report = this.db.createDeliveryReport(announcement.id);
      this.db.setAnnouncementStatus(announcement.id, 'processing', { deliveryMode: mode });

      if (mode === 'channel') {
        await this.#deliverToChannel(announcement, report);
      } else {
        await this.#deliverToOptedInMembers(announcement, report);
      }

      this.db.completeDeliveryReport(announcement.id);
      const finalReport = this.db.getDeliveryReport(announcement.id);
      const finalStatus = finalReport.failedCount > 0 && finalReport.successCount === 0 ? 'failed' : 'completed';
      this.db.setAnnouncementStatus(announcement.id, finalStatus, { destination: announcement.destination });
      this.db.appendAuditLog({
        actorId,
        action: 'ANNOUNCEMENT_BROADCAST',
        announcementId: announcement.id,
        guildId: announcement.guildId,
        metadata: {
          mode,
          status: finalStatus,
          success: finalReport.successCount,
          failed: finalReport.failedCount,
          skipped: finalReport.skippedCount,
        },
      });
      return this.db.getAnnouncement(announcement.id);
    } finally {
      this.inFlight.delete(announcement.id);
    }
  }

  async #deliverToChannel(announcement, report) {
    const guildConfig = this.db.getGuildConfig(announcement.guildId);
    const guild = this.client.guilds.cache.get(announcement.guildId);

    if (!guild) {
      report.failedCount += 1;
      report.failureCategories.CHANNEL_MISSING = 1;
      logger.error(`Broadcast ${announcement.id}: guild ${announcement.guildId} not found`);
      return;
    }

    const channelId = guildConfig?.announcementChannelId;
    const channel = channelId ? guild.channels.cache.get(channelId) : null;

    if (!channel) {
      report.failedCount += 1;
      report.failureCategories.CHANNEL_MISSING = 1;
      logger.error(`Broadcast ${announcement.id}: announcement channel ${channelId ?? 'unset'} missing in guild ${guild.id}`);
      this.db.appendAuditLog({
        actorId: announcement.creatorId,
        action: 'BROADCAST_CHANNEL_MISSING',
        announcementId: announcement.id,
        guildId: guild.id,
      });
      return;
    }

    const payload = {
      embeds: [broadcastEmbed(announcement, guild)],
      allowedMentions: guildConfig?.announcementRoleId
        ? { roles: [guildConfig.announcementRoleId] }
        : { roles: [] },
    };

    const attachment = buildAttachment(announcement);
    if (attachment) payload.files = [attachment];

    if (guildConfig?.announcementRoleId) {
      payload.content = `<@&${guildConfig.announcementRoleId}>`;
    }

    const result = await this.sendWithRetry(channel, payload, announcement.id);
    if (result.ok) {
      report.successCount += 1;
      logger.info(`Broadcast ${announcement.id}: delivered to channel ${channel.id} in guild ${guild.id}`);
    } else {
      report.failedCount += 1;
      const category = result.category ?? 'OTHER';
      report.failureCategories[category] = (report.failureCategories[category] ?? 0) + 1;
      logger.error(`Broadcast ${announcement.id}: channel delivery failed (${category})`, result.error?.message);
    }
    report.eligibleCount = 1;
  }

  async #deliverToOptedInMembers(announcement, report) {
    const guild = this.client.guilds.cache.get(announcement.guildId);
    if (!guild) {
      report.failureCategories.CHANNEL_MISSING = 1;
      return;
    }

    const optIns = this.db.getAnnouncementDmOptIns(announcement.guildId);
    report.eligibleCount = optIns.length;
    if (optIns.length === 0) {
      report.skippedCount = 0;
      logger.info(`Broadcast ${announcement.id}: no opted-in members for DM delivery`);
      return;
    }

    const payload = { embeds: [broadcastEmbed(announcement, guild)] };
    const attachment = buildAttachment(announcement);
    if (attachment) payload.files = [attachment];

    const settings = config.announcements.dmDelivery;
    let consecutiveFailures = 0;

    for (let index = 0; index < optIns.length; index += 1) {
      const userId = optIns[index];
      try {
        const user = await this.client.users.fetch(userId);
        const result = await this.sendWithRetry(user, payload, announcement.id);
        if (result.ok) {
          report.successCount += 1;
          consecutiveFailures = 0;
        } else {
          report.failedCount += 1;
          consecutiveFailures += 1;
          const category = result.category ?? 'OTHER';
          report.failureCategories[category] = (report.failureCategories[category] ?? 0) + 1;
        }
      } catch (error) {
        report.failedCount += 1;
        consecutiveFailures += 1;
        const category = this.categorizeFailure(error);
        report.failureCategories[category] = (report.failureCategories[category] ?? 0) + 1;
        logger.warn(`Broadcast ${announcement.id}: DM to ${userId} failed (${category})`);
      }

      this.db.updateDeliveryReport(announcement.id, {
        successCount: report.successCount,
        failedCount: report.failedCount,
        skippedCount: report.skippedCount,
        failureCategories: report.failureCategories,
      });

      // Abort early if the failure rate suggests a systemic problem.
      if (consecutiveFailures >= settings.maxFailuresBeforeAbort) {
        logger.error(`Broadcast ${announcement.id}: aborting DM delivery after ${consecutiveFailures} consecutive failures`);
        report.skippedCount += optIns.length - (index + 1);
        break;
      }

      // Pacing between DMs — never send in a hot loop.
      const isLast = index === optIns.length - 1;
      if (!isLast) {
        if (index > 0 && (index + 1) % settings.batchSize === 0) {
          await sleep(settings.batchPauseMs);
        } else {
          await sleep(500);
        }
      }
    }
  }
}

module.exports = {
  BroadcastEngine,
  DELIVERY_FAILURE_CATEGORIES,
  broadcastEmbed,
  buildAttachment,
};
