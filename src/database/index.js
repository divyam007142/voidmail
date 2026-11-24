/**
 * Database layer for the announcement bot, backed by JSON files on disk
 * (chosen per project requirements instead of an external database).
 *
 * Collections:
 *  - announcements   : one record per announcement, with content fingerprint
 *  - deliveryReports : per-announcement delivery statistics
 *  - auditLogs       : immutable administrative action trail
 *  - guildConfig     : per-guild channels, roles, and emoji settings
 *  - pendingWorkflows: in-progress announcement workflows (restart-safe)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JsonStore } = require('./jsonStore');
const config = require('../config');
const logger = require('../utils/logger');

class Database {
  constructor(dataDir = config.database.dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });

    const options = { debounceMs: config.database.saveDebounceMs };
    this.announcements = new JsonStore(path.join(dataDir, 'announcements.json'), options.debounceMs);
    this.deliveryReports = new JsonStore(path.join(dataDir, 'deliveryReports.json'), options.debounceMs);
    this.auditLogs = new JsonStore(path.join(dataDir, 'auditLogs.json'), options.debounceMs);
    this.guildConfig = new JsonStore(path.join(dataDir, 'guildConfig.json'), options.debounceMs);
    this.announcementDmOptIns = new JsonStore(path.join(dataDir, 'announcementDmOptIns.json'), options.debounceMs);
    this.pendingWorkflows = new JsonStore(path.join(dataDir, 'pendingWorkflows.json'), options.debounceMs);
  }

  // ------------------------------------------------------------------
  // Announcements
  // ------------------------------------------------------------------

  createAnnouncement(record) {
    const id = this.generateAnnouncementId();
    const now = new Date().toISOString();
    const announcement = {
      id,
      title: record.title,
      description: record.description,
      bannerURL: record.bannerURL ?? null,
      attachment: record.attachment ?? null,
      creatorId: record.creatorId,
      guildId: record.guildId,
      createdAt: now,
      completedAt: null,
      status: 'pending', // pending | processing | completed | failed | cancelled
      contentFingerprint: record.contentFingerprint ?? null,
      destination: record.destination ?? null,
      deliveryMode: record.deliveryMode ?? 'channel',
    };
    this.announcements.set(id, announcement);
    return announcement;
  }

  getAnnouncement(id) {
    return this.announcements.get(id) ?? null;
  }

  updateAnnouncement(id, patch) {
    const existing = this.announcements.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    this.announcements.set(id, updated);
    return updated;
  }

  setAnnouncementStatus(id, status, extra = {}) {
    const patch = { status };
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      patch.completedAt = new Date().toISOString();
    }
    return this.updateAnnouncement(id, { ...patch, ...extra });
  }

  listAnnouncements({ status, limit = 25, offset = 0 } = {}) {
    const all = Object.values(this.announcements.get());
    const filtered = status ? all.filter((a) => a.status === status) : all;
    return {
      total: filtered.length,
      items: filtered.slice(offset, offset + limit),
    };
  }

  findRecentByFingerprint(fingerprint, withinMs = 10 * 60 * 1000) {
    if (!fingerprint) return null;
    const cutoff = Date.now() - withinMs;
    const matches = Object.values(this.announcements.get())
      .filter((a) => a.contentFingerprint === fingerprint)
      .filter((a) => new Date(a.createdAt).getTime() >= cutoff)
      .filter((a) => ['pending', 'processing', 'completed'].includes(a.status))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return matches[0] ?? null;
  }

  generateAnnouncementId() {
    // e.g. ANN-K7Q2XZ91 — readable and collision-resistant enough at
    // this scale, with the full fingerprint providing real uniqueness.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 6; i += 1) {
      suffix += alphabet[crypto.randomInt(alphabet.length)];
    }
    return `ANN-${suffix}`;
  }

  fingerprintContent({ title, description, bannerURL, attachment }) {
    const payload = JSON.stringify({
      t: title?.trim().toLowerCase(),
      d: description?.trim().toLowerCase(),
      b: bannerURL ?? '',
      a: attachment?.url ?? '',
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  // ------------------------------------------------------------------
  // Delivery reports
  // ------------------------------------------------------------------

  createDeliveryReport(announcementId) {
    const report = {
      announcementId,
      eligibleCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      failureCategories: {},
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationMs: null,
    };
    this.deliveryReports.set(announcementId, report);
    return report;
  }

  getDeliveryReport(announcementId) {
    return this.deliveryReports.get(announcementId) ?? null;
  }

  updateDeliveryReport(announcementId, patch) {
    const existing = this.deliveryReports.get(announcementId);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    this.deliveryReports.set(announcementId, updated);
    return updated;
  }

  completeDeliveryReport(announcementId) {
    const existing = this.deliveryReports.get(announcementId);
    if (!existing) return null;
    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt) - new Date(existing.startedAt);
    return this.updateDeliveryReport(announcementId, { completedAt, durationMs });
  }

  // ------------------------------------------------------------------
  // Audit logs (append-only)
  // ------------------------------------------------------------------

  appendAuditLog({ actorId, action, announcementId = null, guildId = null, metadata = {} }) {
    const id = `AUD-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const record = {
      id,
      actorId,
      action,
      announcementId,
      guildId,
      timestamp: new Date().toISOString(),
      metadata,
    };
    const logs = this.auditLogs.get('logs', []);
    logs.unshift(record);
    // Cap stored entries to keep file sizes reasonable.
    if (logs.length > 2000) logs.length = 2000;
    this.auditLogs.set('logs', logs);
    return record;
  }

  listAuditLogs({ announcementId, actorId, limit = 10, offset = 0 } = {}) {
    const logs = this.auditLogs.get('logs', []);
    const filtered = logs.filter((entry) => {
      if (announcementId && entry.announcementId !== announcementId) return false;
      if (actorId && entry.actorId !== actorId) return false;
      return true;
    });
    return {
      total: filtered.length,
      items: filtered.slice(offset, offset + limit),
    };
  }

  // ------------------------------------------------------------------
  // Guild configuration
  // ------------------------------------------------------------------

  getGuildConfig(guildId) {
    const all = this.guildConfig.get({}, {});
    return all[guildId] ?? null;
  }

  upsertGuildConfig(guildId, patch) {
    const all = this.guildConfig.get();
    const existing = all[guildId] ?? {
      guildId,
      panelChannelId: null,
      announcementChannelId: null,
      authorizedRoleId: null,
      announcementRoleId: null,
      dmDeliveryEnabled: false,
      emojiOverrides: {},
      panelMessageId: null,
    };
    const updated = { ...existing, ...patch, guildId };
    all[guildId] = updated;
    this.guildConfig.data = all;
    this.guildConfig.flushNow();
    return updated;
  }

  // ------------------------------------------------------------------
  // Pending workflows (preview → confirm), restart-safe
  // ------------------------------------------------------------------

  setPendingWorkflow(messageId, workflow) {
    this.pendingWorkflows.set(messageId, { ...workflow, createdAt: workflow.createdAt ?? new Date().toISOString() });
    this.pendingWorkflows.flushNow();
  }

  getPendingWorkflow(messageId) {
    return this.pendingWorkflows.get(messageId) ?? null;
  }

  deletePendingWorkflow(messageId) {
    this.pendingWorkflows.delete(messageId);
    this.pendingWorkflows.flushNow();
  }

  // ------------------------------------------------------------------
  // Global stats
  // ------------------------------------------------------------------

  getStats() {
    const announcements = Object.values(this.announcements.get());
    return {
      totalAnnouncements: announcements.length,
      completed: announcements.filter((a) => a.status === 'completed').length,
      failed: announcements.filter((a) => a.status === 'failed').length,
      pendingOrProcessing: announcements.filter((a) => ['pending', 'processing'].includes(a.status)).length,
    };
  }

  flushAll() {
    for (const store of [
      this.announcements,
      this.deliveryReports,
      this.auditLogs,
      this.guildConfig,
      this.announcementDmOptIns,
      this.pendingWorkflows,
    ]) {
      store.flushNow();
    }
  }
}

let instance = null;
function getDatabase() {
  if (!instance) {
    instance = new Database();
    logger.info(`Database initialised at ${instance.dataDir}`);
  }
  return instance;
}

module.exports = { Database, getDatabase };
