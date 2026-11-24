/**
 * Explicit DM opt-in registry.
 *
 * The bot NEVER sends unsolicited announcement DMs. Members opt in with
 * /announce-dm opt-in; their choice is stored per guild and can be
 * revoked at any time with /announce-dm opt-out. DM delivery mode only
 * ever targets these recorded user IDs.
 */
class DmOptInService {
  constructor(database) {
    this.db = database;
  }

  optIn(guildId, userId) {
    const all = this.db.announcementDmOptIns.get();
    const guildSet = new Set(all[guildId] ?? []);
    guildSet.add(userId);
    all[guildId] = [...guildSet];
    this.db.announcementDmOptIns.data = all;
    this.db.announcementDmOptIns.flushNow();
    return all[guildId];
  }

  optOut(guildId, userId) {
    const all = this.db.announcementDmOptIns.get();
    const guildSet = new Set(all[guildId] ?? []);
    guildSet.delete(userId);
    all[guildId] = [...guildSet];
    this.db.announcementDmOptIns.data = all;
    this.db.announcementDmOptIns.flushNow();
    return all[guildId];
  }

  list(guildId) {
    const all = this.db.announcementDmOptIns.get();
    return all[guildId] ?? [];
  }
}

module.exports = { DmOptInService };
