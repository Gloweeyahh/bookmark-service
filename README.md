# bookmark-service

A small HTTP API for saving bookmarks. Built around one idea: the
interesting part of an API isn't the happy path, it's what happens when
a caller sends something wrong — an empty field, the wrong type, a
field ten times too long, or the exact same request twice.

Plain Node.js, zero dependencies — no Express, no database, nothing to
`npm install`. See "Why no framework" below for the reasoning.

**Live URL:** https://bookmark-service-zg64.onrender.com/

## Endpoints

All responses are JSON. Every endpoint accepts an optional `X-Owner-Id`
header (defaults to `anonymous`) — see "Ownership" below.

| Method | Path | Success | Failure |
|---|---|---|---|
| `POST` | `/bookmarks` | `201` (created) or `200` (already existed — see "How repeats are recognized") | `400` if the body is invalid, naming the field |
| `GET` | `/bookmarks` | `200`, `{ bookmarks: [...] }` — only the caller's own | — |
| `GET` | `/bookmarks/:id` | `200`, the bookmark | `400` if `id` isn't validly formed; `404` if it doesn't exist or belongs to someone else |
| `DELETE` | `/bookmarks/:id` | `204`, empty body | `400` if `id` isn't validly formed; `404` if it doesn't exist or belongs to someone else |
| `GET` | `/` | `200`, basic service info | — |

Anything else — an unknown route, or a method a route doesn't support —
returns `404` or `405`, never a `500`.

### Creating a bookmark

```
POST /bookmarks
Content-Type: application/json

{ "url": "https://example.com/article", "title": "An article", "tags": ["reading"] }
```

`url` is required. `title` and `tags` are optional. Validation, with the
exact response for each case:

| What's wrong | Status | Body |
|---|---|---|
| `url` missing | 400 | `{"field":"url","message":"url is required"}` |
| `url` is `""` or whitespace | 400 | `{"field":"url","message":"url must not be empty"}` |
| `url` is a number, not a string | 400 | `{"field":"url","message":"url must be a string"}` |
| `url` over 2048 characters | 400 | `{"field":"url","message":"url must be 2048 characters or fewer"}` |
| `url` isn't a valid URL, or isn't http(s) | 400 | `{"field":"url","message":"url must be a valid URL"}` |
| `title` present but not a string, or too long | 400 | `{"field":"title","message":"..."}` |
| `tags` present but not an array of strings | 400 | `{"field":"tags","message":"..."}` |
| request body isn't valid JSON | 400 | `{"field":"body","message":"request body must be valid JSON"}` |
| request body over 100KB | 400 | `{"field":"body","message":"request body is too large"}` |

## How repeats are recognized

**Two `POST /bookmarks` requests count as "the same" when they have the
same owner and the same URL.** The second one doesn't create a new row
— it returns the existing bookmark, with `200` instead of `201` so a
caller can tell the difference between "just created" and "already
existed."

I considered the more common pattern — a client-supplied idempotency
key (a header the client generates once per logical operation, and the
server remembers). That's the right tool when you're protecting against
a network retry of one specific request. I didn't use it here, because
for a bookmark manager specifically, the more useful rule isn't "don't
double-submit this exact request" — it's "I only ever want one bookmark
for a given page." A URL-based key gives me that directly, and it also
means a caller doesn't have to know to generate and send a key at all;
sending the same URL twice, days apart, still correctly does nothing
the second time, which an idempotency-key approach wouldn't guarantee
unless the caller happened to reuse the same key.

The trade-off: this means the "duplicate" check is content-based, not
request-based. Sending `{"url": "https://example.com/a"}` and
`{"url": "https://example.com/a/"}` (trailing slash) are treated as
*different* URLs right now — the match is an exact string comparison
after trimming whitespace, nothing smarter. That's deliberate for this
version, not an oversight — see "What's deliberately not implemented."

Deleting a bookmark frees up its URL — creating it again afterward
makes a genuinely new bookmark, not a rejected duplicate. That's tested
in `store.test.js`.

## Ownership

There's no real authentication here — no accounts, no passwords, no
sessions. Instead, every request may carry an `X-Owner-Id` header
(any non-empty string, under 100 characters); `GET /bookmarks` only
returns bookmarks created under that same value, and `GET`/`DELETE`
`/bookmarks/:id` treat a bookmark owned by someone else as `404`, not
as a permissions error that would leak whether it exists. If the header
is omitted entirely, everything defaults to a shared `anonymous` owner
— so the API is usable immediately, with zero setup, while still
demonstrating "list only your own" when a caller sets the header.

This is a deliberate stand-in for real auth, not real auth. Anyone can
claim to be `X-Owner-Id: alice` — there's no verification. See "What's
deliberately not implemented."

## Why every error is a 400, not a 500

Every route is wrapped in one place (`server.js`, the `.catch()` around
`handleRequest`) so that *anything* unexpected — not just the
validation failures listed above — still comes back as a `400` rather
than crashing into Node's default error handling. That's a deliberate
trade-off worth being honest about: a genuine bug in this code, one I
didn't anticipate, would also show up as a 400 instead of the 500 that
would normally signal "this is the server's fault, not yours." For an
API whose entire brief is "never 500 the caller," I decided that
trade-off was the right one to make explicitly rather than leave to
chance — but it does mean a 400 from this API doesn't *always*
guarantee the problem is in the request. The validation table above is
the actual contract; the catch-all is a safety net behind it.

## Why in-memory storage

Bookmarks live in a plain JavaScript `Map`, in the Node process's own
memory — nothing is written to disk or a database. That means data
does not survive a restart, and Render's free tier restarts the
service after periods of inactivity. For what this brief is checking —
that validation, status codes, and dedup behave correctly within a
running session — that's enough, and it kept the whole project
dependency-free (no database to provision, connect to, or explain how
to run locally). A version meant to keep data long-term would need a
real datastore; that's future work, not something I ran out of time
for.

## Why no framework

No Express, no router library — just Node's built-in `http` module.
With four routes and this much validation, a framework wasn't solving
a problem I actually had, and skipping it means `npm install` installs
nothing: cloning this repo and running it takes one command, with
nothing that can fail to install or drift out of date.

## What's deliberately not implemented

- **Real authentication.** `X-Owner-Id` is a scoping label, not a
  verified identity — see "Ownership."
- **URL canonicalization.** `https://example.com/a` and
  `https://example.com/a/` are different bookmarks right now, even
  though a person would consider them the same page. Fixing this means
  deciding a canonicalization rule (strip trailing slash? ignore query
  param order? ignore `www.`?) — a real decision with real trade-offs,
  deliberately left for later rather than guessed at.
- **Persistence.** See "Why in-memory storage."
- **Pagination on `GET /bookmarks`.** Fine at the scale this is built
  for; would need addressing before this scaled to thousands of
  bookmarks per owner.
- **Rate limiting.** Nothing stops a caller from hammering this.

## Running it locally

No install step:

```
node server.js
```

That starts it on port 3000 (or `PORT` from the environment, if set).
Try it:

```
curl -X POST http://localhost:3000/bookmarks \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/article","title":"An article"}'
```

## Running the checks

```
node --test
```

No install, no framework — `node:test` ships with Node itself (18+).
This runs three files:

- `validate.test.js` — pure validation logic, no server involved
- `store.test.js` — dedup and ownership scoping, no server involved
- `server.test.js` — starts the real server on a random free port and
  hits it with real HTTP requests (using Node's built-in `fetch`),
  checking the actual status codes a caller would see

A passing run ends with:

```
# tests 49
# suites 0
# pass 49
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

`# fail 0` is what matters.

## Deploying

Deployed on [Render](https://render.com)'s free tier (no credit card,
connects straight to a GitHub repo):

1. Push this repo to GitHub.
2. On Render: **New → Web Service** → connect the repo.
3. Build command: leave blank (nothing to install).
4. Start command: `node server.js`.
5. Deploy.

Free-tier services sleep after 15 minutes of no traffic and take
30-60 seconds to wake on the next request — expected, not a bug, if
the first request after a while feels slow.

## Files

- `server.js` — HTTP routing, request parsing, and error handling
- `validate.js` — pure validation functions (no HTTP, no storage)
- `store.js` — in-memory storage, ownership scoping, and dedup
- `validate.test.js`, `store.test.js`, `server.test.js` — automated checks
- `package.json` — metadata only; there are no dependencies to install
