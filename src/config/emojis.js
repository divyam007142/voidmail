/**
 * Centralized emoji configuration.
 *
 * Replace the fallback Unicode emojis with your application's registered
 * custom emojis. For custom emojis use the full Discord emoji format:
 *
 *   Default (animated):  <a:emoji_name:1234567890123456789>
 *   Default (static):    <:emoji_name:1234567890123456789>
 *
 * The `name` field is used by Discord's `ApplicationCommandOption`/button
 * labels where applicable; the `id` is used for custom emoji rendering.
 * For custom emojis, EMOJI(id) renders the full `<:name:id>` string.
 */
const FALLBACKS = {
  ANNOUNCEMENT: { name: 'megaphone', emoji: '\u{1F4E3}', animated: false },
  CREATE: { name: 'create', emoji: '\u{271B}', animated: false },
  SEND: { name: 'send', emoji: '\u{1F4E8}', animated: false },
  CANCEL: { name: 'cancel', emoji: '\u{274C}', animated: false },
  SUCCESS: { name: 'success', emoji: '\u{2705}', animated: false },
  ERROR: { name: 'error', emoji: '\u{26D4}', animated: false },
  WARNING: { name: 'warning', emoji: '\u{26A0}\u{FE0F}', animated: false },
  INFO: { name: 'info', emoji: '\u{2139}\u{FE0F}', animated: false },
  DENIED: { name: 'denied', emoji: '\u{1F512}', animated: false },
  STATISTICS: { name: 'statistics', emoji: '\u{1F4CA}', animated: false },
  HISTORY: { name: 'history', emoji: '\u{1F553}', animated: false },
  AUDIT: { name: 'audit', emoji: '\u{1F464}', animated: false },
  SETTINGS: { name: 'settings', emoji: '\u{2699}\u{FE0F}', animated: false },
  SERVER: { name: 'server', emoji: '\u{1F5A5}\u{FE0F}', animated: false },
  DELIVERY: { name: 'delivery', emoji: '\u{1F4EC}', animated: false },
  FIRST_PAGE: { name: 'first_page', emoji: '\u{23EE}', animated: false },
  PREVIOUS: { name: 'previous', emoji: '\u{25C0}', animated: false },
  NEXT: { name: 'next', emoji: '\u{25B6}', animated: false },
  LAST_PAGE: { name: 'last_page', emoji: '\u{23ED}', animated: false },
  SPARKLES: { name: 'sparkles', emoji: '\u{2728}', animated: false },
  CLOCK: { name: 'clock', emoji: '\u{23F0}', animated: false },
};

function parseCustom(raw) {
  const match = /^<(a)?:([A-Za-z0-9_]+):(\d{17,20})>$/.exec(raw);
  if (!match) return null;
  return { animated: Boolean(match[1]), name: match[2], id: match[3] };
}

const EMOJIS = Object.fromEntries(
  Object.entries(FALLBACKS).map(([key, value]) => [key, { ...value }]),
);

function emoji(key) {
  const entry = EMOJIS[key];
  if (!entry) return FALLBACKS.INFO.emoji;
  const custom = parseCustom(entry.emoji);
  if (custom) return entry.emoji;
  return entry.emoji;
}

function emojiId(key) {
  const entry = EMOJIS[key];
  if (!entry) return null;
  const custom = parseCustom(entry.emoji);
  return custom ? custom.id : null;
}

function isCustom(key) {
  return Boolean(parseCustom(EMOJIS[key]?.emoji ?? ''));
}

// Allow operators to override individual emojis through env vars, e.g.
// EMOJI_ANNOUNCEMENT="<:megaphone:1234567890123456789>"
for (const key of Object.keys(EMOJIS)) {
  const override = process.env[`EMOJI_${key}`];
  if (override) EMOJIS[key].emoji = override;
}

module.exports = { EMOJIS, emoji, emojiId, isCustom };
