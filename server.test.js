/**
 * These start the actual server (server.js, unmodified) on a random
 * free port and talk to it with real HTTP requests, using the global
 * `fetch` Node ships with. Unlike validate.test.js and store.test.js,
 * this is the layer that proves the *status codes* are right — pure
 * function tests can't catch a route returning the wrong code.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('./server');
const store = require('./store');

let baseUrl;

test.before(() => new Promise((resolve) => {
  server.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}`;
    resolve();
  });
}));

test.after(() => new Promise((resolve) => server.close(resolve)));

test.beforeEach(() => store._resetForTests());

function req(path, options = {}) {
  return fetch(baseUrl + path, options);
}

test('GET / returns 200 with basic service info', async () => {
  const res = await req('/');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.service, 'bookmark-service');
});

test('POST /bookmarks with a valid body returns 201 and the created bookmark', async () => {
  const res = await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/article', title: 'An article' }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.id);
  assert.equal(body.url, 'https://example.com/article');
  assert.equal(body.title, 'An article');
});

test('POST /bookmarks with a missing url returns 400 naming the url field', async () => {
  const res = await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.field, 'url');
});

test('POST /bookmarks with an empty string url returns 400 naming the url field', async () => {
  const res = await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: '' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).field, 'url');
});

test('POST /bookmarks with a numeric url returns 400 naming the url field', async () => {
  const res = await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 4815162342 }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).field, 'url');
});

test('POST /bookmarks with a 2KB url returns 400 naming the url field, not a 500', async () => {
  const hugeUrl = 'https://example.com/' + 'a'.repeat(2048);
  const res = await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: hugeUrl }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).field, 'url');
});

test('POST /bookmarks with a malformed JSON body returns 400, not 500', async () => {
  const res = await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ this is not valid json',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).field, 'body');
});

test('POST /bookmarks with an oversized body returns 400, not 500', async () => {
  const res = await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com', title: 'x'.repeat(200_000) }),
  });
  assert.equal(res.status, 400);
});

test('sending the same create request twice returns 201 then 200, and leaves one row', async () => {
  const payload = { url: 'https://example.com/idempotent-test', title: 'Same one twice' };
  const first = await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const second = await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);

  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.equal(firstBody.id, secondBody.id);

  const list = await (await req('/bookmarks')).json();
  assert.equal(list.bookmarks.length, 1);
});

test('GET /bookmarks lists what was created, scoped to the caller', async () => {
  await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Owner-Id': 'alice' },
    body: JSON.stringify({ url: 'https://example.com/alices-link' }),
  });
  await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Owner-Id': 'bob' },
    body: JSON.stringify({ url: 'https://example.com/bobs-link' }),
  });

  const aliceList = await (await req('/bookmarks', { headers: { 'X-Owner-Id': 'alice' } })).json();
  const bobList = await (await req('/bookmarks', { headers: { 'X-Owner-Id': 'bob' } })).json();

  assert.equal(aliceList.bookmarks.length, 1);
  assert.equal(bobList.bookmarks.length, 1);
  assert.equal(aliceList.bookmarks[0].url, 'https://example.com/alices-link');
});

test('GET /bookmarks/:id returns 200 for a bookmark that exists', async () => {
  const created = await (await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/fetch-me' }),
  })).json();

  const res = await req('/bookmarks/' + created.id);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, created.id);
});

test('GET /bookmarks/:id returns 404 for a well-formed id that does not exist', async () => {
  const res = await req('/bookmarks/00000000-0000-0000-0000-000000000000');
  assert.equal(res.status, 404);
});

test('GET /bookmarks/:id returns 400, not 500, for a malformed id', async () => {
  const res = await req('/bookmarks/not-a-real-id');
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.field, 'id');
});

test('GET /bookmarks/:id returns 400, not 500, for a path-traversal-shaped id', async () => {
  const res = await req('/bookmarks/..%2F..%2Fetc%2Fpasswd');
  assert.equal(res.status, 400);
});

test('DELETE /bookmarks/:id removes it, and a second delete returns 404', async () => {
  const created = await (await req('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/delete-me' }),
  })).json();

  const first = await req('/bookmarks/' + created.id, { method: 'DELETE' });
  assert.equal(first.status, 204);

  const second = await req('/bookmarks/' + created.id, { method: 'DELETE' });
  assert.equal(second.status, 404);

  const getAfter = await req('/bookmarks/' + created.id);
  assert.equal(getAfter.status, 404);
});

test('an invalid X-Owner-Id header returns 400 naming that field, not a 500', async () => {
  const res = await req('/bookmarks', { headers: { 'X-Owner-Id': '   ' } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).field, 'X-Owner-Id');
});

test('an unknown route returns 404, not 500', async () => {
  const res = await req('/definitely/not/a/real/route');
  assert.equal(res.status, 404);
});

test('a disallowed method on a known route returns 405, not 500', async () => {
  const res = await req('/bookmarks', { method: 'PATCH' });
  assert.equal(res.status, 405);
});
