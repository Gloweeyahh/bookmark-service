const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('./store');

test.beforeEach(() => store._resetForTests());

test('createBookmark returns created:true for a new bookmark', () => {
  const { created } = store.createBookmark('alice', { url: 'https://example.com' });
  assert.equal(created, true);
});

test('creating the same owner+url twice returns the same bookmark, created:false the second time', () => {
  const first = store.createBookmark('alice', { url: 'https://example.com/a', title: 'First' });
  const second = store.createBookmark('alice', { url: 'https://example.com/a', title: 'Ignored' });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.bookmark.id, first.bookmark.id);
  // The original title wins — a repeat create doesn't overwrite it.
  assert.equal(second.bookmark.title, 'First');

  assert.equal(store.listBookmarks('alice').length, 1);
});

test('the same url is a separate bookmark for a different owner', () => {
  store.createBookmark('alice', { url: 'https://example.com/a' });
  const { created } = store.createBookmark('bob', { url: 'https://example.com/a' });
  assert.equal(created, true);
  assert.equal(store.listBookmarks('alice').length, 1);
  assert.equal(store.listBookmarks('bob').length, 1);
});

test('listBookmarks only returns the given owner\'s bookmarks', () => {
  store.createBookmark('alice', { url: 'https://example.com/1' });
  store.createBookmark('alice', { url: 'https://example.com/2' });
  store.createBookmark('bob', { url: 'https://example.com/3' });
  assert.equal(store.listBookmarks('alice').length, 2);
  assert.equal(store.listBookmarks('bob').length, 1);
});

test('getBookmark returns null for a nonexistent id', () => {
  assert.equal(store.getBookmark('alice', '00000000-0000-0000-0000-000000000000'), null);
});

test('getBookmark returns null when the bookmark belongs to a different owner', () => {
  const { bookmark } = store.createBookmark('alice', { url: 'https://example.com' });
  assert.equal(store.getBookmark('bob', bookmark.id), null);
});

test('deleteBookmark returns false for a nonexistent id, true when it deletes something', () => {
  assert.equal(store.deleteBookmark('alice', '00000000-0000-0000-0000-000000000000'), false);
  const { bookmark } = store.createBookmark('alice', { url: 'https://example.com' });
  assert.equal(store.deleteBookmark('alice', bookmark.id), true);
  assert.equal(store.getBookmark('alice', bookmark.id), null);
});

test('deleteBookmark cannot be used by a different owner to delete someone else\'s bookmark', () => {
  const { bookmark } = store.createBookmark('alice', { url: 'https://example.com' });
  assert.equal(store.deleteBookmark('bob', bookmark.id), false);
  assert.notEqual(store.getBookmark('alice', bookmark.id), null);
});

test('after deleting a bookmark, the same url can be added again as a brand-new bookmark', () => {
  const first = store.createBookmark('alice', { url: 'https://example.com' });
  store.deleteBookmark('alice', first.bookmark.id);
  const second = store.createBookmark('alice', { url: 'https://example.com' });
  assert.equal(second.created, true);
  assert.notEqual(second.bookmark.id, first.bookmark.id);
});

test('returned bookmarks are copies — mutating one does not affect stored state', () => {
  const { bookmark } = store.createBookmark('alice', { url: 'https://example.com', tags: ['a'] });
  bookmark.title = 'mutated';
  bookmark.tags.push('b');
  const fresh = store.getBookmark('alice', bookmark.id);
  assert.equal(fresh.title, null);
  assert.deepEqual(fresh.tags, ['a']);
});
