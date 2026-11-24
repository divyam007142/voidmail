/**
 * Lightweight leveled logger with optional file output.
 * Diagnostic detail goes to the console; user-facing messages never
 * include stack traces (handled in errorHandler instead).
 */
const fs = require('fs');
const path = require('path');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

let logDir = null;
function ensureLogDir(dataDir) {
  if (logDir) return logDir;
  logDir = path.join(dataDir, 'logs');
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    logDir = null;
  }
  return logDir;
}

function serialize(args) {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return '[unserializable object]';
        }
      }
      return String(arg);
    })
    .join(' ');
}

function write(level, args) {
  if (LEVELS[level] < minLevel) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${serialize(args)}`;
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](line);
  if (logDir && (level === 'error' || level === 'warn')) {
    try {
      fs.appendFileSync(path.join(logDir, 'bot.log'), `${line}\n`);
    } catch {
      /* file logging is best-effort */
    }
  }
}

module.exports = {
  init: ensureLogDir,
  debug: (...args) => write('debug', args),
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
};
