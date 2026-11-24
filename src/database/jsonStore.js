/**
 * Minimal persistent JSON storage engine.
 *
 * Each collection is a single JSON file inside DATA_DIR. Writes are
 * debounced and made atomically (temp file + rename) so a crash never
 * corrupts the data file. All access goes through the Database class in
 * ../database/index.js — nothing else should touch this module directly.
 */
const fs = require('fs');
const path = require('path');

class JsonStore {
  #scheduleTimer = null;

  constructor(filePath, debounceMs) {
    this.filePath = filePath;
    this.debounceMs = debounceMs;
    this.data = this.#load();
  }

  #load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        // Corrupt file: preserve it rather than silently overwriting.
        try {
          fs.copyFileSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
        } catch {
          /* ignore */
        }
      }
      return {};
    }
  }

  #persist() {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tempPath = `${this.filePath}.tmp-${process.pid}`;
    fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2));
    fs.renameSync(tempPath, this.filePath);
  }

  #schedule() {
    if (this.#scheduleTimer) return;
    this.#scheduleTimer = setTimeout(() => {
      this.#scheduleTimer = null;
      this.flush();
    }, this.debounceMs);
  }

  flush() {
    if (this.#scheduleTimer) {
      clearTimeout(this.#scheduleTimer);
      this.#scheduleTimer = null;
    }
    try {
      this.#persist();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[JsonStore] Failed to persist ${this.filePath}:`, error.message);
    }
  }

  get(key, fallback) {
    if (key === undefined || key === null) return this.data;
    return this.data[key] ?? fallback;
  }

  set(key, value) {
    this.data[key] = value;
    this.#schedule();
  }

  delete(key) {
    delete this.data[key];
    this.#schedule();
  }

  /** Immediate synchronous write — used for critical state transitions. */
  flushNow() {
    this.flush();
  }
}

module.exports = { JsonStore };
