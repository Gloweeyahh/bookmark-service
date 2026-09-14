/**
 * Storage. In-memory only, on purpose — see README, "Why in-memory
 * storage." Kept separate from server.js so the dedup and scoping
 * logic can be tested without starting an HTTP server.
 */

const { randomUUID } = require('crypto');

const bookmarksById = new Map();
// Maps "<owner>\u0000<url>" -> id, so a repeat create for the same
// owner+url is recognized in O(1) without scanning every bookmark.
const dedupIndex = new Map();

function dedupKey(owner, url) {
  // NUL can't appear in either owner or url, so this can't collide
  // across owners the way a plain string concatenation could.
  return owner + '\u0000' + url;
}

function clone(bookmark) {
  return { ...bookmark, tags: [...bookmark.tags] };
}

/**
 * Creates a bookmark, or returns the existing one if this owner
 * already has a bookmark for this exact URL. See README for why
 * (owner, url) — not a client-supplied key — is what "the same
 * bookmark" means here.
 */
function createBookmark(owner, { url, title, tags }) {
  const normalizedUrl = url.trim();
  const key = dedupKey(owner, normalizedUrl);
  const existingId = dedupIndex.get(key);

  if (existingId) {
    return { bookmark: clone(bookmarksById.get(existingId)), created: false };
  }

  const bookmark = {
    id: randomUUID(),
    owner,
    url: normalizedUrl,
    title: title !== undefined ? title : null,
    tags: tags !== undefined ? [...tags] : [],
    createdAt: new Date().toISOString(),
  };
  bookmarksById.set(bookmark.id, bookmark);
  dedupIndex.set(key, bookmark.id);
  return { bookmark: clone(bookmark), created: true };
}

function listBookmarks(owner) {
  return [...bookmarksById.values()]
    .filter((b) => b.owner === owner)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(clone);
}

function getBookmark(owner, id) {
  const bookmark = bookmarksById.get(id);
  if (!bookmark || bookmark.owner !== owner) return null;
  return clone(bookmark);
}

/** Returns true if something was deleted, false if there was nothing to delete. */
function deleteBookmark(owner, id) {
  const bookmark = bookmarksById.get(id);
  if (!bookmark || bookmark.owner !== owner) return false;
  bookmarksById.delete(id);
  dedupIndex.delete(dedupKey(owner, bookmark.url));
  return true;
}

/** Test-only: clears all state between test cases. Not used by server.js. */
function _resetForTests() {
  bookmarksById.clear();
  dedupIndex.clear();
}

module.exports = { createBookmark, listBookmarks, getBookmark, deleteBookmark, _resetForTests };
