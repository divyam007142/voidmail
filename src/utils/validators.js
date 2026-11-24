/**
 * Validation helpers for announcement workflow inputs.
 * These run at the boundary (modal submissions, attachment URLs) before
 * anything is stored or broadcast.
 */
const { EmbedBuilder } = require('discord.js');
const { emoji } = require('./emojis');
const { COLORS, embed } = require('./theme');
const config = require('../config');

const URL_PATTERN = /^https?:\/\/[^\s<>"]+$/i;

function validateTitle(rawTitle) {
  const title = (rawTitle ?? '').trim();
  if (!title) return { ok: false, error: 'The announcement title cannot be empty.' };
  if (title.length > config.announcements.maxTitleLength) {
    return {
      ok: false,
      error: `The title must be at most ${config.announcements.maxTitleLength} characters (currently ${title.length}).`,
    };
  }
  return { ok: true, value: title };
}

function validateDescription(rawDescription) {
  const description = (rawDescription ?? '').trim();
  if (!description) return { ok: false, error: 'The announcement description cannot be empty.' };
  if (description.length > config.announcements.maxDescriptionLength) {
    return {
      ok: false,
      error: `The description must be at most ${config.announcements.maxDescriptionLength} characters (currently ${description.length}).`,
    };
  }
  return { ok: true, value: description };
}

function validateBannerUrl(rawUrl) {
  const url = (rawUrl ?? '').trim();
  if (!url) return { ok: true, value: null };

  if (!URL_PATTERN.test(url)) {
    return { ok: false, error: 'The banner URL must be a valid http(s) link.' };
  }

  const extension = extractExtension(url);
  if (extension && !config.announcements.allowedImageExtensions.includes(extension)) {
    return {
      ok: false,
      error: `Unsupported banner format \`${extension}\`. Allowed: ${config.announcements.allowedImageExtensions.join(', ')}`,
    };
  }

  const builder = new EmbedBuilder();
  try {
    builder.setImage(url);
  } catch {
    return { ok: false, error: 'The banner URL is not a usable image link for Discord embeds.' };
  }

  return { ok: true, value: url };
}

function validateAttachment(rawUrl, rawName) {
  const url = (rawUrl ?? '').trim();
  if (!url) return { ok: true, value: null };

  if (!URL_PATTERN.test(url)) {
    return { ok: false, error: 'The attachment URL must be a valid http(s) link.' };
  }

  const extension = extractExtension(url);
  if (extension && !config.announcements.allowedMediaExtensions.includes(extension)) {
    return {
      ok: false,
      error: `Unsupported attachment format \`${extension}\`. Allowed: ${config.announcements.allowedMediaExtensions.join(', ')}`,
    };
  }

  const name = (rawName ?? '').trim().slice(0, 100) || url.split('/').pop()?.slice(0, 100) || 'attachment';

  return { ok: true, value: { url, name } };
}

function extractExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = /\.[a-z0-9]+$/i.exec(pathname);
    return match ? match[0].toLowerCase() : null;
  } catch {
    return null;
  }
}

function validationErrorEmbed(message) {
  return new EmbedBuilder(embed(COLORS.danger, {
    title: `${emoji('ERROR')}  Validation Failed`,
    description: message,
  }));
}

module.exports = {
  validateTitle,
  validateDescription,
  validateBannerUrl,
  validateAttachment,
  validationErrorEmbed,
  extractExtension,
  URL_PATTERN,
};
