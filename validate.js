/**
 * Validation, kept completely separate from both the HTTP layer
 * (server.js) and storage (store.js) so it can be tested without
 * starting a server or touching the data store. Every function here
 * returns a plain object — never throws — so a caller can never
 * accidentally turn a validation failure into an uncaught exception.
 */

const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 200;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;
const MAX_OWNER_LENGTH = 100;
const MAX_BODY_BYTES = 100 * 1024; // 100KB — generous for a bookmark, bounded on purpose

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a request body for POST /bookmarks.
 * Returns null when valid, or { field, message } naming exactly what's
 * wrong — this return shape is what server.js sends straight back as
 * the 400 response body.
 */
function validateCreateBody(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { field: 'body', message: 'request body must be a JSON object' };
  }

  const { url, title, tags } = body;

  if (url === undefined) {
    return { field: 'url', message: 'url is required' };
  }
  if (typeof url !== 'string') {
    return { field: 'url', message: 'url must be a string' };
  }
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    return { field: 'url', message: 'url must not be empty' };
  }
  if (trimmedUrl.length > MAX_URL_LENGTH) {
    return { field: 'url', message: `url must be ${MAX_URL_LENGTH} characters or fewer` };
  }
  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { field: 'url', message: 'url must start with http:// or https://' };
    }
  } catch {
    return { field: 'url', message: 'url must be a valid URL' };
  }

  if (title !== undefined) {
    if (typeof title !== 'string') {
      return { field: 'title', message: 'title must be a string' };
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return { field: 'title', message: `title must be ${MAX_TITLE_LENGTH} characters or fewer` };
    }
  }

  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      return { field: 'tags', message: 'tags must be an array of strings' };
    }
    if (tags.length > MAX_TAGS) {
      return { field: 'tags', message: `tags must have ${MAX_TAGS} or fewer items` };
    }
    for (const tag of tags) {
      if (typeof tag !== 'string' || tag.length > MAX_TAG_LENGTH) {
        return { field: 'tags', message: `each tag must be a string of ${MAX_TAG_LENGTH} characters or fewer` };
      }
    }
  }

  return null;
}

/** Validates a bookmark id taken from the URL path. */
function validateId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) {
    return { error: 'id must be a valid bookmark id' };
  }
  return { value: id };
}

/**
 * Validates the optional X-Owner-Id header, which stands in for real
 * authentication — see README for why. Defaults to 'anonymous' so the
 * API is usable with zero setup.
 */
function validateOwnerHeader(raw) {
  if (raw === undefined) {
    return { value: 'anonymous' };
  }
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { error: 'X-Owner-Id must not be empty' };
  }
  if (raw.length > MAX_OWNER_LENGTH) {
    return { error: `X-Owner-Id must be ${MAX_OWNER_LENGTH} characters or fewer` };
  }
  return { value: raw.trim() };
}

module.exports = {
  validateCreateBody,
  validateId,
  validateOwnerHeader,
  MAX_URL_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MAX_OWNER_LENGTH,
  MAX_BODY_BYTES,
};
