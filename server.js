/**
 * bookmark-service — plain Node `http`, no framework, no dependencies.
 * See README for why. Routing, request parsing, and error handling
 * all live here; validation is in validate.js, storage in store.js.
 */

const http = require('http');
const { validateCreateBody, validateId, validateOwnerHeader, MAX_BODY_BYTES } = require('./validate');
const store = require('./store');

const PORT = process.env.PORT || 3000;

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(json);
}

/** Reads the full request body, rejecting anything over MAX_BODY_BYTES
 *  as it arrives rather than buffering an unbounded amount first.
 *  Deliberately does NOT destroy the socket on rejection — doing so
 *  killed the connection before the 400 response could be written,
 *  which meant an oversized body produced a broken connection instead
 *  of the 400 it was supposed to. Sending the response, with
 *  Connection: close, and letting Node close the socket naturally
 *  once that response is flushed is what actually delivers the 400. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejected = true;
        reject(Object.assign(new Error('body too large'), { code: 'BODY_TOO_LARGE' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const parts = pathname.split('/').filter(Boolean);

  const ownerCheck = validateOwnerHeader(req.headers['x-owner-id']);
  if (ownerCheck.error) {
    return sendJson(res, 400, { field: 'X-Owner-Id', message: ownerCheck.error });
  }
  const owner = ownerCheck.value;

  if (pathname === '/' && req.method === 'GET') {
    return sendJson(res, 200, {
      service: 'bookmark-service',
      status: 'ok',
      endpoints: ['POST /bookmarks', 'GET /bookmarks', 'GET /bookmarks/:id', 'DELETE /bookmarks/:id'],
    });
  }

  if (parts[0] === 'bookmarks' && parts.length === 1) {
    if (req.method === 'POST') {
      let raw;
      try {
        raw = await readBody(req);
      } catch (err) {
        if (err.code === 'BODY_TOO_LARGE') {
          res.setHeader('Connection', 'close');
          return sendJson(res, 400, { field: 'body', message: 'request body is too large' });
        }
        return sendJson(res, 400, { field: 'body', message: 'request body could not be read' });
      }

      let body;
      try {
        body = raw.length ? JSON.parse(raw) : {};
      } catch {
        return sendJson(res, 400, { field: 'body', message: 'request body must be valid JSON' });
      }

      const validationError = validateCreateBody(body);
      if (validationError) {
        return sendJson(res, 400, validationError);
      }

      const { bookmark, created } = store.createBookmark(owner, body);
      return sendJson(res, created ? 201 : 200, bookmark);
    }

    if (req.method === 'GET') {
      return sendJson(res, 200, { bookmarks: store.listBookmarks(owner) });
    }

    return sendJson(res, 405, { message: `method ${req.method} not allowed on /bookmarks` });
  }

  if (parts[0] === 'bookmarks' && parts.length === 2) {
    const idCheck = validateId(parts[1]);
    if (idCheck.error) {
      return sendJson(res, 400, { field: 'id', message: idCheck.error });
    }
    const id = idCheck.value;

    if (req.method === 'GET') {
      const bookmark = store.getBookmark(owner, id);
      if (!bookmark) return sendJson(res, 404, { message: 'bookmark not found' });
      return sendJson(res, 200, bookmark);
    }

    if (req.method === 'DELETE') {
      const deleted = store.deleteBookmark(owner, id);
      if (!deleted) return sendJson(res, 404, { message: 'bookmark not found' });
      res.writeHead(204);
      return res.end();
    }

    return sendJson(res, 405, { message: `method ${req.method} not allowed on /bookmarks/:id` });
  }

  return sendJson(res, 404, { message: 'not found' });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(() => {
    // Anything unexpected that reaches here — rather than being caught
    // by the validation above — is still answered as a 400, not a 500.
    // See README, "Why every error is a 400, not just the expected
    // ones," for the reasoning and the trade-off this accepts.
    if (!res.headersSent) {
      sendJson(res, 400, { field: null, message: 'request could not be processed' });
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`bookmark-service listening on port ${PORT}`);
  });
}

module.exports = server;
