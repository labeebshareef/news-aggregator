# News Aggregator API

A RESTful API for a personalised news aggregator, built with Node.js, Express, bcrypt and JWT.
Users sign up, choose the topics and language they care about, and get news from an external
provider ([NewsAPI](https://newsapi.org)) filtered to those preferences. They can search, mark
articles as read or favourite, and get fast responses thanks to a cache that is kept fresh in the background.

## Contents

- [Features](#features)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Error handling](#error-handling)
- [Testing](#testing)
- [Design decisions](#design-decisions)

## Features

| Area | What is implemented |
| --- | --- |
| Authentication | Signup with bcrypt password hashing, login returning a signed JWT, auth middleware on every per-user route, rate limiting on signup and login |
| Preferences | Read and update news topics and language per user |
| News | Personalised news from NewsAPI via `axios` and keyword search, both in the user's language |
| Read / favourite | Mark articles as read or favourite and list both; `GET /news` shows `isRead` / `isFavorite` on each article |
| Caching | TTL cache with request coalescing, stale-on-error fallback and LRU eviction; `X-Cache` response header shows `HIT`, `MISS` or `STALE` |
| Periodic updates | Background job refreshing the queries users read recently, within the provider's quota |
| Validation and errors | Validation of every body and path parameter, one consistent JSON error format, clean 4xx for malformed JSON or URLs, JSON 404 for unknown routes |
| Extras beyond the brief | Language preference, `DELETE /news/:id/favorite`, `GET /health`, Postman collection |
| Security | `helmet` headers, 10 kb body limit, login does not reveal which emails are registered (same message and similar timing), password hash never leaves the service layer |

## Getting started

**Requirements:** Node.js 18 or newer.

```bash
git clone <your-fork-url>
cd news-aggregator
npm install
cp .env.example .env   # optional, every setting has a default for development
npm start              # or `npm run dev` to restart on file changes
```

The server listens on `http://localhost:3000`. Check it with:

```bash
curl http://localhost:3000/health
```

### News API key

News comes from [NewsAPI](https://newsapi.org). Create a free key at
[newsapi.org/register](https://newsapi.org/register) and set it in `.env`:

```
NEWS_API_KEY=your-key
```

Without a key the server still starts and every route works, but news endpoints return an empty
`news` list with a `notice` explaining why. `GET /health` shows the active provider (`newsapi` or `none`).
The test suite does not need a key.

## Configuration

All configuration comes from environment variables (or a `.env` file) and is read and validated in
`src/config/index.js`. The app refuses to start with an invalid combination, such as
`NODE_ENV=production` without a `JWT_SECRET`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | `production` makes `JWT_SECRET` mandatory |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` or `silent` |
| `JWT_SECRET` | development-only value | Secret used to sign tokens |
| `JWT_EXPIRES_IN` | `1h` | Token lifetime in seconds or with a unit (`15m`, `1h`, `7d`); checked at startup |
| `BCRYPT_SALT_ROUNDS` | `10` | bcrypt cost factor |
| `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX` | `900000` / `20` | Signups and failed logins allowed per IP per window |
| `NEWS_API_KEY` | empty | NewsAPI key; without it news endpoints return no articles |
| `NEWS_API_BASE_URL` | `https://newsapi.org/v2` | NewsAPI base URL |
| `NEWS_API_TIMEOUT_MS` | `5000` | Timeout for each provider request |
| `NEWS_PAGE_SIZE` | `20` | Articles per request |
| `NEWS_CACHE_TTL_MS` | `600000` | How long cached news counts as fresh (10 min) |
| `NEWS_CACHE_MAX_ENTRIES` | `500` | Cached queries kept before LRU eviction |
| `NEWS_REFRESH_INTERVAL_MS` | `300000` | Background refresh interval (5 min) |
| `NEWS_REFRESH_ACTIVE_WINDOW_MS` | `1800000` | Only queries read within this window are refreshed (30 min) |
| `NEWS_REFRESH_MAX_QUERIES` | `25` | Upper limit on refreshed queries per pass |

## Project structure

The code is layered so each layer has one job and depends only on the layers below it.

```
app.js                        Entry point: builds the app, listens when run directly, exports it for tests
src/
├── app.js                    Express setup: security middleware, body parsing, routers, error handling
├── server.js                 HTTP server lifecycle: start, background job, graceful shutdown
├── container.js              Composition root: creates and wires every dependency
├── config/                   Environment configuration with defaults and validation
├── routes/                   URL → middleware chain → controller
├── middleware/               authenticate (JWT), validate, error handler, 404
├── validators/               Input rules for request bodies and parameters
├── controllers/              HTTP in, HTTP out; no business logic
├── services/                 Business logic: auth, preferences, news (including read and favourite lists)
├── repositories/             Data access (in-memory, behind async interfaces)
├── providers/                News sources behind a common interface (NewsAPI, or none when no key is set)
├── cache/                    TTL cache
├── jobs/                     Background cache refresher
└── utils/                    Error classes, logger, async handler
test/
├── server.test.js            Provided test suite (unchanged)
├── auth.test.js              Signup, login, token handling, rate limiting
├── preferences.test.js       Preference validation, normalisation, isolation between users
├── news.test.js              News, caching, provider failures, search, read and favourite
├── cache.test.js             Cache behaviour and the background refresher
├── newsapi-provider.test.js  NewsAPI request building, query escaping and error mapping
├── helpers/                  Test app factory and an offline news provider double
└── fixtures/                 Articles served by the provider double (tests only)
docs/
└── news-aggregator.postman_collection.json
```

A request flows through the layers like this:

```
request → route → authenticate → validate → controller → service → repository / cache → provider
                                                                      │
response ← controller ← service ←─────────────────────────────────────┘
errors at any step → error handler → { "error": { ... } }
```

## API reference

Base URL: `http://localhost:3000`. Bodies are JSON. Routes marked 🔒 need the header
`Authorization: Bearer <token>` from `POST /users/login`.

A Postman collection with every request is in [`docs/`](docs/news-aggregator.postman_collection.json).
It stores the token automatically after login.

### Auth

#### `POST /users/signup`

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | required, 1–100 characters |
| `email` | string | required, valid email, case-insensitive, unique |
| `password` | string | required, at least 8 characters with a letter and a number, at most 72 bytes |
| `preferences` | string[] | optional, up to 20 topics of up to 50 characters each |

```bash
curl -X POST http://localhost:3000/users/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Clark Kent","email":"clark@superman.com","password":"Krypt()n8","preferences":["movies","comics"]}'
```

`200 OK`

```json
{
  "message": "User registered successfully",
  "user": {
    "id": "4f1c…",
    "name": "Clark Kent",
    "email": "clark@superman.com",
    "preferences": ["movies", "comics"],
    "language": "en",
    "createdAt": "2026-10-26T06:40:34.651Z",
    "updatedAt": "2026-10-26T06:40:34.651Z"
  }
}
```

Errors: `400` invalid input, `409` email already registered, `429` too many attempts.

#### `POST /users/login`

```bash
curl -X POST http://localhost:3000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"clark@superman.com","password":"Krypt()n8"}'
```

`200 OK`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs…",
  "tokenType": "Bearer",
  "expiresAt": "2026-10-26T07:40:34.000Z",
  "user": { "id": "4f1c…", "name": "Clark Kent", "email": "clark@superman.com", "…": "…" }
}
```

Errors: `400` missing or malformed email or password, `401` wrong email or password (same response for both), `429` too many failed attempts.

### Preferences

#### `GET /users/preferences` 🔒

`200 OK`

```json
{ "preferences": ["movies", "comics"], "language": "en" }
```

#### `PUT /users/preferences` 🔒

Send `preferences`, `language`, or both; a field that is left out keeps its value. `preferences` replaces the
whole topic list. Topics are trimmed and case-insensitive duplicates are removed (the first spelling is kept).

| Field | Type | Rules |
| --- | --- | --- |
| `preferences` | string[] | up to 20 topics of up to 50 characters; `[]` clears them |
| `language` | string | one of `ar de en es fr he it nl no pt ru sv ud zh` |

```bash
curl -X PUT http://localhost:3000/users/preferences \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"preferences":["movies","comics","games"],"language":"en"}'
```

`200 OK`

```json
{ "message": "Preferences updated", "preferences": ["movies", "comics", "games"], "language": "en" }
```

### News

Every `/news` route needs a token.

#### `GET /news` 🔒

News matching the user's topics in their language, newest first. Users without topics get general top headlines.
Each topic is sent to NewsAPI as an exact phrase, so text like `AND` or `-sports` is never treated as query syntax.
If no API key is configured, `news` is empty and the response also has a `notice` field.

```bash
curl -i http://localhost:3000/news -H "Authorization: Bearer $TOKEN"
```

`200 OK`, with header `X-Cache: HIT | MISS | STALE`

```json
{
  "count": 20,
  "news": [
    {
      "id": "a3f9c1d2e4b5a6f7",
      "title": "Indie games dominate this year's award nominations",
      "description": "Small studios took most of the nominations…",
      "url": "https://…",
      "imageUrl": "https://…",
      "source": "Example News",
      "author": "Jane Doe",
      "publishedAt": "2026-10-25T18:45:00Z",
      "isRead": false,
      "isFavorite": false
    }
  ]
}
```

Article ids are derived from the article URL, so the same story always has the same id.

#### `GET /news/search/:keyword` 🔒

Searches articles in the user's language. The keyword must be 2–100 characters.

```bash
curl http://localhost:3000/news/search/climate -H "Authorization: Bearer $TOKEN"
```

`200 OK`: `{ "keyword": "climate", "count": 12, "news": [ … ] }`

#### `POST /news/:id/read` 🔒 and `POST /news/:id/favorite` 🔒

Marks an article returned by `GET /news` or a search. Repeating the call is safe.

```bash
curl -X POST http://localhost:3000/news/a3f9c1d2e4b5a6f7/favorite -H "Authorization: Bearer $TOKEN"
```

`200 OK`: `{ "message": "Article marked as favorite", "article": { … } }`

Errors: `400` malformed id, `404` the API has not served an article with this id.

#### `GET /news/read` 🔒 and `GET /news/favorites` 🔒

The user's lists, most recently added first. Each article has an `addedAt` timestamp. The lists keep
a copy of each article, so they stay complete after the article leaves the news cache.

`200 OK`: `{ "count": 2, "news": [ { …, "addedAt": "2026-10-26T06:41:02.120Z" } ] }`

#### `DELETE /news/:id/favorite` 🔒

Removes a favourite. `204 No Content`, or `404` if the article is not a favourite.

### Health

#### `GET /health`

`200 OK`: `{ "status": "ok", "newsProvider": "newsapi", "uptimeSeconds": 42 }`

## Error handling

Every error response has the same shape, so clients need only one parser:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "email", "message": "email must be a valid email address" }]
  }
}
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing fields, wrong types, invalid email, weak password, bad preferences or ids |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 400 | `BAD_REQUEST` | Malformed URL, e.g. invalid percent-encoding |
| 401 | `UNAUTHORIZED` | Missing, malformed, tampered or expired token; wrong credentials |
| 404 | `NOT_FOUND` | Unknown route or article |
| 409 | `CONFLICT` | Email already registered |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 10 kb |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Body charset or encoding not supported |
| 429 | `TOO_MANY_REQUESTS` | Signup or failed-login rate limit reached |
| 502 | `NEWS_PROVIDER_ERROR` | News provider failed or rejected the API key (details are logged, not returned) |
| 503 | `NEWS_PROVIDER_ERROR` | News provider rate limit reached |
| 504 | `NEWS_PROVIDER_ERROR` | News provider timed out |
| 500 | `INTERNAL_ERROR` | Unexpected error; details are logged, never sent to the client |

When the provider fails but an older copy of the requested news is cached, the API returns that copy
with `X-Cache: STALE` instead of an error.

## Testing

```bash
npm test
```

No API key or network is needed. The provided `test/server.test.js` is unchanged and uses the app as it
is configured: with no `NEWS_API_KEY` it gets an empty news list; if your `.env` sets a key, its
`GET /news` test calls NewsAPI for real. The other test files inject an offline provider double
(`test/helpers/sample-news-provider.js`, reading `test/fixtures/`) and always run offline. They add tests covering validation, authentication edge cases, rate
limiting, caching, provider failures, search, the read and favourite lists, the background refresher
and NewsAPI error mapping. External calls are replaced with test doubles injected through
`createApp(overrides)`, and cache expiry is tested with an injected clock instead of real waiting.

## Design decisions

- **Layers and a composition root.** Routes, controllers, services and repositories each have one job.
  `src/container.js` is the only file that chooses concrete classes, which keeps the rest of the code
  testable: the tests swap in a fake news provider without mocking modules.
- **In-memory storage behind repositories.** The assignment needs no database, so data lives in memory
  and is lost on restart. Repositories expose async methods and copy records in and out, so moving to
  MongoDB or PostgreSQL means adding a new repository class, not changing services.
- **Provider interface.** Every provider implements `searchArticles({ query, language })` and returns
  one normalised article shape. Adding GNews or NewsCatcher means adding one class. Without a key the app
  uses a provider that returns nothing, so it never presents made-up articles as news.
- **Caching that protects the quota.** Free news APIs allow about 100 requests a day. Topic lists are
  sorted before building the cache key, so users with the same topics share one entry; concurrent
  misses share one request; and the background refresher reloads only queries read in the last
  30 minutes, at most 25 per pass.
- **Validation at the edge.** Validators turn raw input into a normalised `req.validated`, and
  controllers read only from it. Login checks only that the password is present, so a wrong
  password is a `401`, not a `400`.
- **Security.** Passwords longer than 72 bytes are rejected because bcrypt silently ignores the rest.
  Login compares against a dummy hash for unknown emails and returns one message for both cases, so the
  API does not reveal which emails are registered. Tokens are verified with the algorithm pinned to HS256.
