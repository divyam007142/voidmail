/**
 * Audit service — thin wrapper for appending audit entries, kept separate
 * so command modules and services share one consistent logging format.
 */
class AuditService {
  constructor(database) {
    this.db = database;
  }

  log({ actorId, action, announcementId = null, guildId = null, metadata = {} }) {
    return this.db.appendAuditLog({ actorId, action, announcementId, guildId, metadata });
  }
}

module.exports = { AuditService };
