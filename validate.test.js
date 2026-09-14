const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCreateBody, validateId, validateOwnerHeader, MAX_URL_LENGTH } = require('./validate');

test('validateCreateBody accepts a minimal valid body', () => {
  assert.equal(validateCreateBody({ url: 'https://example.com' }), null);
});

test('validateCreateBody rejects a missing url, naming the field', () => {
  const err = validateCreateBody({});
  assert.equal(err.field, 'url');
  assert.match(err.message, /required/);
});

test('validateCreateBody rejects an empty string url', () => {
  const err = validateCreateBody({ url: '' });
  assert.equal(err.field, 'url');
});

test('validateCreateBody rejects url as a whitespace-only string', () => {
  const err = validateCreateBody({ url: '   ' });
  assert.equal(err.field, 'url');
});

test('validateCreateBody rejects a numeric url', () => {
  const err = validateCreateBody({ url: 12345 });
  assert.equal(err.field, 'url');
  assert.match(err.message, /string/);
});

test('validateCreateBody rejects a url over the length limit', () => {
  const longUrl = 'https://example.com/' + 'a'.repeat(MAX_URL_LENGTH);
  const err = validateCreateBody({ url: longUrl });
  assert.equal(err.field, 'url');
  assert.match(err.message, /characters or fewer/);
});

test('validateCreateBody accepts a url right at the length limit', () => {
  const path = 'a'.repeat(MAX_URL_LENGTH - 'https://example.com/'.length);
  const url = 'https://example.com/' + path;
  assert.equal(url.length, MAX_URL_LENGTH);
  assert.equal(validateCreateBody({ url }), null);
});

test('validateCreateBody rejects a non-URL string', () => {
  const err = validateCreateBody({ url: 'not a url at all' });
  assert.equal(err.field, 'url');
});

test('validateCreateBody rejects a non-http(s) scheme', () => {
  const err = validateCreateBody({ url: 'ftp://example.com/file' });
  assert.equal(err.field, 'url');
  assert.match(err.message, /http/);
});

test('validateCreateBody rejects a body that is not a JSON object', () => {
  assert.equal(validateCreateBody('hello').field, 'body');
  assert.equal(validateCreateBody(42).field, 'body');
  assert.equal(validateCreateBody(null).field, 'body');
  assert.equal(validateCreateBody(['https://example.com']).field, 'body');
});

test('validateCreateBody rejects a non-string title', () => {
  const err = validateCreateBody({ url: 'https://example.com', title: 42 });
  assert.equal(err.field, 'title');
});

test('validateCreateBody rejects a title over the length limit', () => {
  const err = validateCreateBody({ url: 'https://example.com', title: 'x'.repeat(500) });
  assert.equal(err.field, 'title');
});

test('validateCreateBody rejects tags that are not an array', () => {
  const err = validateCreateBody({ url: 'https://example.com', tags: 'reading' });
  assert.equal(err.field, 'tags');
});

test('validateCreateBody rejects a tags array containing a non-string', () => {
  const err = validateCreateBody({ url: 'https://example.com', tags: ['reading', 7] });
  assert.equal(err.field, 'tags');
});

test('validateCreateBody accepts a fully populated valid body', () => {
  const err = validateCreateBody({
    url: 'https://example.com/article',
    title: 'An article',
    tags: ['reading', 'later'],
  });
  assert.equal(err, null);
});

test('validateId accepts a well-formed UUID', () => {
  const result = validateId('123e4567-e89b-12d3-a456-426614174000');
  assert.equal(result.error, undefined);
});

test('validateId rejects garbage input without throwing', () => {
  assert.equal(validateId('not-an-id').error, 'id must be a valid bookmark id');
  assert.equal(validateId('').error, 'id must be a valid bookmark id');
  assert.equal(validateId('../../etc/passwd').error, 'id must be a valid bookmark id');
});

test('validateOwnerHeader defaults to "anonymous" when absent', () => {
  assert.equal(validateOwnerHeader(undefined).value, 'anonymous');
});

test('validateOwnerHeader rejects an empty string', () => {
  assert.equal(validateOwnerHeader('').error, 'X-Owner-Id must not be empty');
});

test('validateOwnerHeader rejects a value over the length limit', () => {
  assert.ok(validateOwnerHeader('x'.repeat(500)).error);
});

test('validateOwnerHeader trims and accepts a normal value', () => {
  assert.equal(validateOwnerHeader('  gloria  ').value, 'gloria');
});
