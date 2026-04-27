# CLI and Agent Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `fomoplayer` CLI binary, MCP server, and agent skill that give users and Claude agents full programmatic access to Fomo Player via API keys.

**Architecture:** New `packages/cli` shares a common HTTP client with an MCP stdio server. The backend gains API key auth (SHA-256 hash in DB, `passport-custom` strategy), a two-tier in-process rate limiter, a dedicated CLI OIDC login route, a read-only SQL query endpoint backed by PostgreSQL RLS, and an `undo_mark_heard` endpoint.

**Tech Stack:** Node 22, Express, passport-custom, node-sql-parser, @modelcontextprotocol/sdk, yargs, cascade-test

---

## Execution notes

**Two parallel teams** — backend (Tasks 1–4) and CLI (Tasks 5–8) have zero file overlap and can run concurrently. CLI team uses the API contract in this plan as its spec; integration point is Task 5 (CLI tests hit the live backend).

**Security review gates** — run `/security-review` after Task 1 (auth infrastructure) and after Task 4 (query API + RLS). These are the two highest-risk surfaces.

**Single-piece flow** — every task commits code + tests + migrations + config together. No "tests in the next task."

---

## File map

**Backend — new:**
- `packages/back/migrations/20260427110000-add-api-key.js` + `sqls/…`
- `packages/back/migrations/20260427120000-add-query-rls.js` + `sqls/…`
- `packages/back/db/api-key.js`
- `packages/back/routes/shared/api-key-rate-limiter.js`
- `packages/back/routes/users/api-keys.js`
- `packages/back/routes/users/query.js`
- `packages/back/test/lib/api-key.js`
- `packages/back/test/tests/users/auth/api-key-exchange.js`
- `packages/back/test/tests/users/auth/api-key-auth.js`
- `packages/back/test/tests/users/auth/api-key-rate-limit.js`
- `packages/back/test/tests/users/auth/api-key-management.js`
- `packages/back/test/tests/users/auth/api-key-pentest.js`
- `packages/back/test/tests/users/query.js`
- `packages/back/test/tests/users/query-rls.js`
- `packages/back/test/tests/users/undo-heard.js`

**Backend — modified:**
- `packages/back/passport-setup.js`
- `packages/back/index.js`
- `packages/back/routes/auth.js`
- `packages/back/routes/index.js`
- `packages/back/routes/users/db.js`
- `packages/back/routes/users/api.js`
- `packages/back/.env.test`

**CLI — all new files:**
- `packages/cli/package.json`
- `packages/cli/src/config.js`, `client.js`, `auth.js`, `output.js`
- `packages/cli/src/commands/` (tracks, follows, carts, ignores, notifications, settings, api-keys, query, search, stores, config)
- `packages/cli/mcp/tools.js`, `server.js`
- `packages/cli/bin/fomoplayer.js`
- `packages/cli/test/lib/server.js`, `api-key.js`
- `packages/cli/test/client.test.js`, `mcp/tools.test.js`
- `.claude/settings.json`
- `.claude/skills/fomoplayer.md`


---

## Task 1: API key infrastructure

One vertical slice: migration + DB helpers + passport strategy + rate limiter + CLI login route + exchange endpoint + all auth tests. **Security review after this task.**

**Files:** migration + sqls, `db/api-key.js`, `routes/shared/api-key-rate-limiter.js`, `passport-setup.js`, `index.js`, `routes/auth.js`, `.env.test`, `test/lib/api-key.js`, `test/tests/users/auth/api-key-exchange.js`, `test/tests/users/auth/api-key-auth.js`, `test/tests/users/auth/api-key-rate-limit.js`

- [ ] **Step 1: Write migration SQL**

`packages/back/migrations/sqls/20260427110000-add-api-key-up.sql`:
```sql
CREATE TABLE api_key (
  api_key_id              SERIAL PRIMARY KEY,
  api_key_hash            TEXT NOT NULL UNIQUE,
  api_key_prefix          TEXT NOT NULL,
  api_key_name            TEXT NOT NULL,
  meta_account_user_id    INTEGER NOT NULL REFERENCES meta_account,
  api_key_created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  api_key_last_used_at    TIMESTAMPTZ,
  api_key_revoked_at      TIMESTAMPTZ,
  rate_limit_per_minute   INTEGER NOT NULL DEFAULT 60,
  rate_limit_per_day      INTEGER NOT NULL DEFAULT 1000
);
CREATE INDEX api_key_user_idx ON api_key (meta_account_user_id);
```

`packages/back/migrations/sqls/20260427110000-add-api-key-down.sql`:
```sql
DROP TABLE IF EXISTS api_key;
```

`packages/back/migrations/20260427110000-add-api-key.js`:
```javascript
'use strict';
var fs = require('fs'), path = require('path');
exports.setup = function(options) {};
exports.up = function(db) {
  var filePath = path.join(__dirname, 'sqls', '20260427110000-add-api-key-up.sql');
  return new Promise(function(resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function(err, data) { if (err) return reject(err); resolve(data); });
  }).then(function(data) { return db.runSql(data); });
};
exports.down = function(db) {
  var filePath = path.join(__dirname, 'sqls', '20260427110000-add-api-key-down.sql');
  return new Promise(function(resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function(err, data) { if (err) return reject(err); resolve(data); });
  }).then(function(data) { return db.runSql(data); });
};
exports._meta = { version: 1 };
```

- [ ] **Step 2: Run migration on dev and test databases**

```bash
cd packages/back && npm run migrate
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx db-migrate -e test up
```

Expected: no errors; `\d api_key` in psql shows the table.

- [ ] **Step 3: Write DB helpers**

`packages/back/db/api-key.js`:
```javascript
'use strict'
const crypto = require('crypto')
const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg

const hashApiKey = (rawKey) => crypto.createHash('sha256').update(rawKey).digest('hex')

module.exports.createApiKey = async (userId, rawKey, name) => {
  const hash = hashApiKey(rawKey)
  const prefix = rawKey.slice(0, 8)
  const rows = await pg.queryRowsAsync(sql`
    INSERT INTO api_key (api_key_hash, api_key_prefix, api_key_name, meta_account_user_id)
    VALUES (${hash}, ${prefix}, ${name}, ${userId})
    RETURNING api_key_id, api_key_prefix, api_key_name, api_key_created_at
  `)
  return rows[0]
}

module.exports.findApiKeyByRaw = async (rawKey) => {
  const hash = hashApiKey(rawKey)
  const rows = await pg.queryRowsAsync(sql`
    SELECT api_key_id, meta_account_user_id, rate_limit_per_minute, rate_limit_per_day, api_key_revoked_at
    FROM api_key WHERE api_key_hash = ${hash}
  `)
  return rows[0] ?? null
}

module.exports.touchApiKey = (apiKeyId) =>
  pg.queryAsync(sql`UPDATE api_key SET api_key_last_used_at = NOW() WHERE api_key_id = ${apiKeyId}`)

module.exports.listApiKeys = (userId) =>
  pg.queryRowsAsync(sql`
    SELECT api_key_id, api_key_prefix, api_key_name, api_key_created_at, api_key_last_used_at
    FROM api_key
    WHERE meta_account_user_id = ${userId} AND api_key_revoked_at IS NULL
    ORDER BY api_key_created_at DESC
  `)

module.exports.revokeApiKey = (apiKeyId, userId) =>
  pg.queryAsync(sql`
    UPDATE api_key SET api_key_revoked_at = NOW()
    WHERE api_key_id = ${apiKeyId} AND meta_account_user_id = ${userId}
  `)
```

- [ ] **Step 4: Write rate limiter**

`packages/back/routes/shared/api-key-rate-limiter.js`:
```javascript
'use strict'
class ApiKeyRateLimiter {
  constructor({ now = () => Date.now() } = {}) {
    this._now = now
    this._state = new Map()
  }
  check(keyId, { perMinute, perDay }) {
    const now = this._now()
    let s = this._state.get(keyId) ?? { minute: { count: 0, windowStart: now }, day: { count: 0, windowStart: now } }
    if (now - s.minute.windowStart >= 60_000) s = { ...s, minute: { count: 0, windowStart: now } }
    if (now - s.day.windowStart >= 86_400_000) s = { ...s, day: { count: 0, windowStart: now } }
    if (s.minute.count >= perMinute) {
      return { allowed: false, retryAfter: Math.ceil((s.minute.windowStart + 60_000 - now) / 1000),
        limitPerMinute: perMinute, remainingMinute: 0, limitPerDay: perDay, remainingDay: Math.max(0, perDay - s.day.count) }
    }
    if (s.day.count >= perDay) {
      return { allowed: false, retryAfter: Math.ceil((s.day.windowStart + 86_400_000 - now) / 1000),
        limitPerMinute: perMinute, remainingMinute: Math.max(0, perMinute - s.minute.count), limitPerDay: perDay, remainingDay: 0 }
    }
    s = { minute: { ...s.minute, count: s.minute.count + 1 }, day: { ...s.day, count: s.day.count + 1 } }
    this._state.set(keyId, s)
    return { allowed: true, limitPerMinute: perMinute, remainingMinute: perMinute - s.minute.count,
      limitPerDay: perDay, remainingDay: perDay - s.day.count }
  }
}
module.exports = { ApiKeyRateLimiter, apiKeyRateLimiter: new ApiKeyRateLimiter() }
```

- [ ] **Step 5: Install passport-custom and add passport strategy**

```bash
cd packages/back && npm install passport-custom
```

In `packages/back/passport-setup.js`, add after the JwtStrategy block and before `passport.serializeUser`:
```javascript
  const CustomStrategy = require('passport-custom').Strategy
  const { findApiKeyByRaw, touchApiKey } = require('./db/api-key')
  const { apiKeyRateLimiter } = require('./routes/shared/api-key-rate-limiter')

  passport.use('api-key', new CustomStrategy(async (req, done) => {
    try {
      const authHeader = req.headers.authorization ?? ''
      if (!authHeader.startsWith('Bearer fp_')) return done(null, false)
      const rawKey = authHeader.slice(7)
      const keyRecord = await findApiKeyByRaw(rawKey)
      if (!keyRecord || keyRecord.api_key_revoked_at) return done(null, false)
      const rl = apiKeyRateLimiter.check(keyRecord.api_key_id, {
        perMinute: keyRecord.rate_limit_per_minute,
        perDay: keyRecord.rate_limit_per_day,
      })
      if (!rl.allowed) return done(null, false, { rateLimited: true, ...rl })
      touchApiKey(keyRecord.api_key_id).catch(() => {})
      const user = await account.findByUserId(keyRecord.meta_account_user_id)
      return done(null, user ?? false)
    } catch (e) {
      return done(e)
    }
  }))
```

- [ ] **Step 6: Wire api-key auth branch in index.js**

Replace the `/api` auth middleware block in `packages/back/index.js`:
```javascript
const authenticateApiKey = (req, res, next) =>
  passport.authenticate('api-key', { session: false }, (err, user, info) => {
    if (err) return next(err)
    if (!user) {
      if (info?.rateLimited) {
        res.set('Retry-After', String(info.retryAfter))
        res.set('X-RateLimit-Limit-Minute', String(info.limitPerMinute))
        res.set('X-RateLimit-Remaining-Minute', String(info.remainingMinute))
        res.set('X-RateLimit-Limit-Day', String(info.limitPerDay))
        res.set('X-RateLimit-Remaining-Day', String(info.remainingDay))
        return res.status(429).json({ error: 'Rate limit exceeded' })
      }
      return res.status(401).json({ error: 'Invalid or revoked API key' })
    }
    req.user = user
    next()
  })(req, res, next)

app.use(
  '/api',
  (req, res, next) => {
    try {
      const auth = req.headers.authorization ?? ''
      if (auth.startsWith('Bearer fp_')) return authenticateApiKey(req, res, next)
      if (auth) return authenticateJwt(req, res, next)
      return ensureAuthenticated(req, res, next)
    } catch (e) {
      logger.error('Error authenticating request', e)
      next(e)
    }
  },
  require('./routes/index.js'),
)
```

- [ ] **Step 7: Add CLI login route and exchange-handoff endpoint to routes/auth.js**

Add imports at the top of `packages/back/routes/auth.js`:
```javascript
const { v4: uuid } = require('uuid')
const { createApiKey } = require('../db/api-key')
```

Add CLI login route after `router.get('/login/google', ...)`:
```javascript
router.get('/login/cli', (req, res, next) => {
  const callbackPort = parseInt(req.query.callbackPort, 10)
  if (!Number.isInteger(callbackPort) || callbackPort < 1024 || callbackPort > 65535) {
    return res.status(400).json({ error: 'callbackPort must be an integer between 1024 and 65535' })
  }
  return passport.authenticate('openidconnect', { state: { cliCallbackPort: callbackPort } })(req, res, next)
})
```

In `router.get('/login/google/return', ...)`, destructure `cliCallbackPort` from state and add a branch **before** the `wantsHandoff` block:
```javascript
    const { returnPath, handoffTarget, cliCallbackPort } = info?.state ?? {}

    if (cliCallbackPort) {
      const port = parseInt(cliCallbackPort, 10)
      if (!Number.isInteger(port) || port < 1024 || port > 65535) return redirectWithLoginFailed(res)
      if (!canMintHandoff) { logger.warn('CLI login: OIDC_HANDOFF_SECRET not configured'); return redirectWithLoginFailed(res) }
      const oidcIdentity = user?.oidcIdentity
      if (!oidcIdentity?.issuer || !oidcIdentity?.subject) {
        logger.error('CLI login: OIDC identity missing after auth'); return redirectWithLoginFailed(res)
      }
      let token
      try {
        ;({ token } = mintHandoffToken({
          secret: oidcHandoffSecret, issuer: apiOrigin, audience: apiOrigin,
          oidcIssuer: oidcIdentity.issuer, oidcSubject: oidcIdentity.subject,
        }))
      } catch (e) { logger.error(`CLI login: minting handoff token failed: ${e}`); return redirectWithLoginFailed(res) }
      const callbackUrl = new URL(`http://localhost:${port}/`)
      callbackUrl.searchParams.set('token', token)
      return res.redirect(callbackUrl.toString())
    }
```

Add exchange endpoint before `module.exports`:
```javascript
router.post('/api-keys/exchange-handoff', async (req, res, next) => {
  try {
    const { token, name = 'fomoplayer CLI' } = req.body ?? {}
    if (!token) return res.status(400).json({ error: 'token is required' })
    if (!canMintHandoff) return res.status(503).json({ error: 'API key exchange not configured' })
    const payload = verifyHandoffToken({ token, secret: oidcHandoffSecret, issuer: apiOrigin, audience: apiOrigin })
    if (!payload) return res.status(401).json({ error: 'Invalid or expired token' })
    const expiresAt = new Date(payload.exp * 1000)
    const consumed = await consumeHandoffJti(payload.jti, expiresAt)
    if (!consumed) { logger.warn('CLI exchange: token replay rejected', { jti: payload.jti }); return res.status(401).json({ error: 'Token already used' }) }
    const user = await account.findOrCreateByIdentifier(payload.oidcIssuer, payload.sub)
    if (!user) return res.status(500).json({ error: 'User lookup failed' })
    const rawKey = `fp_${uuid()}`
    const keyRecord = await createApiKey(user.id, rawKey, name)
    return res.json({ key: rawKey, id: keyRecord.api_key_id, name: keyRecord.api_key_name })
  } catch (e) { next(e) }
})
```

- [ ] **Step 8: Set OIDC_HANDOFF_SECRET in .env.test**

In `packages/back/.env.test`, change `OIDC_HANDOFF_SECRET=` to:
```
OIDC_HANDOFF_SECRET=test-handoff-secret
```

Also check `packages/back/config.js` for the env var used as `apiOrigin` — verify it resolves to `http://localhost` in the test environment and add it to `.env.test` if missing.

- [ ] **Step 9: Write the test helper**

`packages/back/test/lib/api-key.js`:
```javascript
'use strict'
const { createApiKey } = require('../../db/api-key')
const { resolveTestUserId } = require('./test-user')
let cached = null
module.exports.createTestApiKey = async () => {
  if (cached) return cached
  const userId = await resolveTestUserId()
  const raw = `fp_test_${Date.now()}`
  await createApiKey(userId, raw, 'Test key')
  cached = { raw, userId }
  return cached
}
module.exports.clearTestApiKeyCache = () => { cached = null }
```

- [ ] **Step 10: Write exchange + auth + rate-limit tests**

`packages/back/test/tests/users/auth/api-key-exchange.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { mintHandoffToken } = require('../../../../routes/shared/auth-handoff-token')
const { startServer } = require('../../../lib/server')

const HANDOFF_SECRET = process.env.OIDC_HANDOFF_SECRET
const API_ORIGIN = process.env.API_URL ?? 'http://localhost'
let server, port, baseUrl

test({
  before: async () => { ;({ server, port } = await startServer()); baseUrl = `http://localhost:${port}` },
  after: () => server.kill(),
  'POST /api/auth/api-keys/exchange-handoff': {
    'returns 400 when token missing': async () => {
      const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      assert.strictEqual(r.status, 400)
    },
    'returns 401 for invalid token': async () => {
      const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'bad' }),
      })
      assert.strictEqual(r.status, 401)
    },
    'issues API key for valid handoff token': async () => {
      const { token } = mintHandoffToken({ secret: HANDOFF_SECRET, issuer: API_ORIGIN, audience: API_ORIGIN,
        oidcIssuer: 'accounts.google.com', oidcSubject: 'subj-exchange-1' })
      const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      assert.strictEqual(r.status, 200)
      assert.ok((await r.json()).key.startsWith('fp_'))
    },
    'rejects replayed token': async () => {
      const { token } = mintHandoffToken({ secret: HANDOFF_SECRET, issuer: API_ORIGIN, audience: API_ORIGIN,
        oidcIssuer: 'accounts.google.com', oidcSubject: 'subj-replay-1' })
      const post = () => fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      assert.strictEqual((await post()).status, 200)
      assert.strictEqual((await post()).status, 401)
    },
  },
})
```

`packages/back/test/tests/users/auth/api-key-auth.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { startServer } = require('../../../lib/server')
const { createTestApiKey } = require('../../../lib/api-key')
const { createApiKey } = require('../../../../db/api-key')
const { resolveTestUserId } = require('../../../lib/test-user')
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const crypto = require('crypto')
let server, port, baseUrl, rawKey

test({
  before: async () => {
    ;({ server, port } = await startServer()); baseUrl = `http://localhost:${port}`
    ;({ raw: rawKey } = await createTestApiKey())
  },
  after: () => server.kill(),
  'valid key authenticates': async () => {
    assert.strictEqual((await fetch(`${baseUrl}/api/me/tracks`, { headers: { Authorization: `Bearer ${rawKey}` } })).status, 200)
  },
  'missing header returns 401': async () => {
    assert.strictEqual((await fetch(`${baseUrl}/api/me/tracks`)).status, 401)
  },
  'unknown key returns 401': async () => {
    assert.strictEqual((await fetch(`${baseUrl}/api/me/tracks`, { headers: { Authorization: 'Bearer fp_unknown' } })).status, 401)
  },
  'returns 429 with Retry-After when per-minute limit exceeded': async () => {
    const uid = await resolveTestUserId()
    const raw = `fp_rl_${Date.now()}`
    await createApiKey(uid, raw, 'rl-test')
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    await pg.queryAsync(sql`UPDATE api_key SET rate_limit_per_minute = 1 WHERE api_key_hash = ${hash}`)
    const hdrs = { Authorization: `Bearer ${raw}` }
    assert.strictEqual((await fetch(`${baseUrl}/api/me/tracks`, { headers: hdrs })).status, 200)
    const r2 = await fetch(`${baseUrl}/api/me/tracks`, { headers: hdrs })
    assert.strictEqual(r2.status, 429)
    assert.ok(r2.headers.get('retry-after'))
  },
})
```

`packages/back/test/tests/users/auth/api-key-rate-limit.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { ApiKeyRateLimiter } = require('../../../../routes/shared/api-key-rate-limiter')

test({
  'ApiKeyRateLimiter': {
    'allows requests under limit': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 5; i++) assert.strictEqual(rl.check('k1', { perMinute: 5, perDay: 100 }).allowed, true)
    },
    'blocks at per-minute limit': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 3; i++) rl.check('k2', { perMinute: 3, perDay: 100 })
      const r = rl.check('k2', { perMinute: 3, perDay: 100 })
      assert.strictEqual(r.allowed, false)
      assert.ok(r.retryAfter > 0)
    },
    'resets minute window after 60s': () => {
      let t = 0
      const rl = new ApiKeyRateLimiter({ now: () => t })
      for (let i = 0; i < 3; i++) rl.check('k3', { perMinute: 3, perDay: 100 })
      assert.strictEqual(rl.check('k3', { perMinute: 3, perDay: 100 }).allowed, false)
      t = 60_001
      assert.strictEqual(rl.check('k3', { perMinute: 3, perDay: 100 }).allowed, true)
    },
    'blocks at per-day limit': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 2; i++) rl.check('k4', { perMinute: 100, perDay: 2 })
      assert.strictEqual(rl.check('k4', { perMinute: 100, perDay: 2 }).allowed, false)
    },
    'tracks keys independently': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 3; i++) rl.check('kA', { perMinute: 3, perDay: 100 })
      assert.strictEqual(rl.check('kB', { perMinute: 3, perDay: 100 }).allowed, true)
    },
  },
})
```

- [ ] **Step 11: Run all tests — expect pass**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/auth/api-key-rate-limit.js
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/auth/api-key-exchange.js
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/auth/api-key-auth.js
```

Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add \
  packages/back/migrations/20260427110000-add-api-key.js \
  packages/back/migrations/sqls/20260427110000-add-api-key-up.sql \
  packages/back/migrations/sqls/20260427110000-add-api-key-down.sql \
  packages/back/db/api-key.js \
  packages/back/routes/shared/api-key-rate-limiter.js \
  packages/back/passport-setup.js \
  packages/back/index.js \
  packages/back/routes/auth.js \
  packages/back/.env.test \
  packages/back/package.json packages/back/package-lock.json \
  packages/back/test/lib/api-key.js \
  packages/back/test/tests/users/auth/api-key-exchange.js \
  packages/back/test/tests/users/auth/api-key-auth.js \
  packages/back/test/tests/users/auth/api-key-rate-limit.js
git commit -m "feat: API key infrastructure — auth, rate limiting, CLI login, exchange endpoint"
```

> **Security review gate:** run `/security-review` before proceeding to Task 2.


---

## Task 2: API key management routes

**Files:** `routes/users/api-keys.js` (new), `routes/index.js` (modified), `test/tests/users/auth/api-key-management.js` (new)

- [ ] **Step 1: Write failing tests**

`packages/back/test/tests/users/auth/api-key-management.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { startServer } = require('../../../lib/server')
const { createTestApiKey } = require('../../../lib/api-key')
const { createApiKey } = require('../../../../db/api-key')
const { resolveTestUserId } = require('../../../lib/test-user')
let server, port, baseUrl, rawKey

test({
  before: async () => {
    ;({ server, port } = await startServer()); baseUrl = `http://localhost:${port}`
    ;({ raw: rawKey } = await createTestApiKey())
  },
  after: () => server.kill(),
  'GET /api/me/api-keys returns array with prefix': async () => {
    const r = await fetch(`${baseUrl}/api/me/api-keys`, { headers: { Authorization: `Bearer ${rawKey}` } })
    assert.strictEqual(r.status, 200)
    const keys = await r.json()
    assert.ok(Array.isArray(keys) && keys.length >= 1)
    assert.ok(keys[0].api_key_prefix)
  },
  'DELETE /api/me/api-keys/:id revokes key': async () => {
    const uid = await resolveTestUserId()
    const raw2 = `fp_revoke_${Date.now()}`
    const record = await createApiKey(uid, raw2, 'to-revoke')
    const r = await fetch(`${baseUrl}/api/me/api-keys/${record.api_key_id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${rawKey}` },
    })
    assert.strictEqual(r.status, 204)
    assert.strictEqual((await fetch(`${baseUrl}/api/me/tracks`, { headers: { Authorization: `Bearer ${raw2}` } })).status, 401)
  },
})
```

- [ ] **Step 2: Run tests — expect FAIL (404)**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/auth/api-key-management.js
```

- [ ] **Step 3: Write the router and mount it**

`packages/back/routes/users/api-keys.js`:
```javascript
'use strict'
const router = require('express-promise-router')()
const { listApiKeys, revokeApiKey } = require('../../db/api-key')

router.get('/', async ({ user: { id: userId } }, res) => { res.json(await listApiKeys(userId)) })
router.delete('/:id', async ({ user: { id: userId }, params: { id } }, res) => {
  await revokeApiKey(parseInt(id, 10), userId)
  res.status(204).end()
})
module.exports = router
```

In `packages/back/routes/index.js`, add after `router.use('/me/', usersRouter)`:
```javascript
router.use('/me/api-keys', require('./users/api-keys.js'))
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/auth/api-key-management.js
```

- [ ] **Step 5: Commit**

```bash
git add packages/back/routes/users/api-keys.js packages/back/routes/index.js \
        packages/back/test/tests/users/auth/api-key-management.js
git commit -m "feat: API key list/revoke routes"
```

---

## Task 3: undo_mark_heard

**Files:** `routes/users/db.js` (modified), `routes/users/api.js` (modified), `test/tests/users/undo-heard.js` (new)

- [ ] **Step 1: Write failing tests**

`packages/back/test/tests/users/undo-heard.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')
let server, port, baseUrl, rawKey
const req = (method, path, body) => fetch(`${baseUrl}${path}`, {
  method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
  body: body ? JSON.stringify(body) : undefined,
})

test({
  before: async () => {
    ;({ server, port } = await startServer()); baseUrl = `http://localhost:${port}`
    ;({ raw: rawKey } = await createTestApiKey())
  },
  after: () => server.kill(),
  'PATCH /api/me/tracks/ returns heardAt and count': async () => {
    const r = await req('PATCH', '/api/me/tracks/', { heard: true })
    assert.strictEqual(r.status, 200)
    const body = await r.json()
    assert.ok('heardAt' in body && 'count' in body)
  },
  'DELETE /api/me/tracks/heard returns 400 when since missing': async () => {
    assert.strictEqual((await req('DELETE', '/api/me/tracks/heard')).status, 400)
  },
  'DELETE /api/me/tracks/heard returns 400 for invalid timestamp': async () => {
    assert.strictEqual((await req('DELETE', '/api/me/tracks/heard?since=not-a-date')).status, 400)
  },
  'DELETE /api/me/tracks/heard returns 204 on success': async () => {
    assert.strictEqual((await req('DELETE', `/api/me/tracks/heard?since=${new Date().toISOString()}`)).status, 204)
  },
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/undo-heard.js
```

Expected: PATCH returns 200 but body is empty; DELETE returns 404.

- [ ] **Step 3: Update DB functions in routes/users/db.js**

Replace `module.exports.setTrackHeard`:
```javascript
module.exports.setTrackHeard = async (trackId, userId, heard) => {
  logger.debug('setTrackHeard', { trackId, userId, heard })
  const now = heard ? new Date() : null
  await pg.queryAsync(sql`-- setTrackHeard
UPDATE user__track SET user__track_heard = ${now}
WHERE track_id = ${trackId} AND meta_account_user_id = ${userId}
`)
  return { heardAt: now ? now.toISOString() : null }
}
```

Replace `module.exports.setAllHeard`:
```javascript
module.exports.setAllHeard = async (userId, heard, interval) => {
  const now = heard ? new Date() : null
  const result = await pg.queryAsync(sql`-- setAllHeard
UPDATE user__track SET user__track_heard = ${now}
WHERE track_id IN (
  SELECT track_id FROM user__track NATURAL JOIN track NATURAL JOIN store__track
  WHERE meta_account_user_id = ${userId}
    AND user__track_heard IS NULL
    AND store__track_released < NOW() - ${interval}::INTERVAL
)
`)
  return { heardAt: now ? now.toISOString() : null, count: result.rowCount }
}
```

Add after `setAllHeard`:
```javascript
module.exports.deleteHeardSince = (userId, since) =>
  pg.queryAsync(sql`-- deleteHeardSince
UPDATE user__track SET user__track_heard = NULL
WHERE meta_account_user_id = ${userId} AND user__track_heard >= ${since}
`)
```

- [ ] **Step 4: Update API routes in routes/users/api.js**

Add `deleteHeardSince` to the import destructure from `./db`.

Replace `POST /tracks/:id`:
```javascript
router.post('/tracks/:id', async ({ user: { id: userId }, params: { id }, body: { heard } }, res) => {
  res.json(await setTrackHeard(id, userId, heard))
})
```

Replace `PATCH /tracks/`:
```javascript
router.patch('/tracks/', async ({ user: { id: authUserId }, body: { heard }, query: { interval } }, res) => {
  res.json(await setAllHeard(authUserId, heard, interval))
})
```

Add after `PATCH /tracks/`:
```javascript
router.delete('/tracks/heard', async ({ user: { id: authUserId }, query: { since } }, res) => {
  if (!since) return res.status(400).json({ error: 'since query parameter is required' })
  const sinceDate = new Date(since)
  if (isNaN(sinceDate.getTime())) return res.status(400).json({ error: 'since must be a valid ISO timestamp' })
  await deleteHeardSince(authUserId, sinceDate)
  res.status(204).end()
})
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/undo-heard.js
```

- [ ] **Step 6: Commit**

```bash
git add packages/back/routes/users/db.js packages/back/routes/users/api.js \
        packages/back/test/tests/users/undo-heard.js
git commit -m "feat: undo_mark_heard endpoint; setAllHeard/setTrackHeard return timestamp+count"
```

---

## Task 4: Read-only query API with RLS

One vertical slice: role + RLS migration + query endpoint + schema endpoint + query/RLS/pentest tests. **Security review after this task.**

**Files:** migration + sqls, `routes/users/query.js`, `routes/index.js`, `test/tests/users/query.js`, `test/tests/users/query-rls.js`, `test/tests/users/auth/api-key-pentest.js`

- [ ] **Step 1: Write failing tests**

`packages/back/test/tests/users/query.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')
let server, port, baseUrl, rawKey
const query = (sql) => fetch(`${baseUrl}/api/me/query`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
  body: JSON.stringify({ sql }),
})

test({
  before: async () => {
    ;({ server, port } = await startServer()); baseUrl = `http://localhost:${port}`
    ;({ raw: rawKey } = await createTestApiKey())
  },
  after: () => server.kill(),
  'accepts SELECT': async () => {
    const r = await query('SELECT 1 AS n')
    assert.strictEqual(r.status, 200)
    assert.deepStrictEqual((await r.json()).rows, [{ n: 1 }])
  },
  'rejects INSERT': async () => { assert.strictEqual((await query("INSERT INTO track VALUES (1)")).status, 400) },
  'rejects UPDATE': async () => { assert.strictEqual((await query("UPDATE track SET track_id=1")).status, 400) },
  'rejects DROP':   async () => { assert.strictEqual((await query("DROP TABLE track")).status, 400) },
  'returns 400 when sql missing': async () => {
    const r = await fetch(`${baseUrl}/api/me/query`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({}),
    })
    assert.strictEqual(r.status, 400)
  },
  'caps at 500 rows': async () => {
    const r = await query('SELECT generate_series(1,600) AS n')
    const body = await r.json()
    assert.strictEqual(body.rows.length, 500)
    assert.strictEqual(body.truncated, true)
  },
  'times out slow queries': async () => {
    assert.strictEqual((await query('SELECT pg_sleep(10)')).status, 408)
  },
})
```

`packages/back/test/tests/users/query-rls.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { startServer } = require('../../lib/server')
const { createApiKey } = require('../../../db/api-key')
const { resolveTestUserId } = require('../../lib/test-user')
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
let server, port, baseUrl, keyA, keyB, userAId, userBId
const query = (rawKey, userSql) => fetch(`${baseUrl}/api/me/query`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
  body: JSON.stringify({ sql: userSql }),
}).then((r) => r.json())

test({
  before: async () => {
    ;({ server, port } = await startServer()); baseUrl = `http://localhost:${port}`
    userAId = await resolveTestUserId()
    const [{ meta_account_user_id }] = await pg.queryRowsAsync(sql`
      INSERT INTO meta_account (meta_account_user_id) VALUES (DEFAULT) RETURNING meta_account_user_id
    `)
    userBId = meta_account_user_id
    keyA = `fp_rls_a_${Date.now()}`; keyB = `fp_rls_b_${Date.now()}`
    await createApiKey(userAId, keyA, 'rls-a')
    await createApiKey(userBId, keyB, 'rls-b')
    await pg.queryAsync(sql`INSERT INTO cart (cart_name, meta_account_user_id) VALUES ('rls-test-cart', ${userAId})`)
  },
  after: async () => {
    server.kill()
    await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${userBId}`)
  },
  'user sees own cart': async () => {
    const body = await query(keyA, "SELECT cart_id FROM cart WHERE cart_name='rls-test-cart'")
    assert.ok(body.rows.length >= 1)
  },
  'user does not see another user cart': async () => {
    const body = await query(keyB, "SELECT cart_id FROM cart WHERE cart_name='rls-test-cart'")
    assert.strictEqual(body.rows.length, 0)
  },
  'user cannot read track__cart for another user cart': async () => {
    const [{ cart_id }] = await pg.queryRowsAsync(sql`
      SELECT cart_id FROM cart WHERE cart_name='rls-test-cart' AND meta_account_user_id=${userAId}
    `)
    assert.strictEqual((await query(keyB, `SELECT * FROM track__cart WHERE cart_id=${cart_id}`)).rows.length, 0)
  },
  'cannot access meta_account': async () => {
    const r = await fetch(`${baseUrl}/api/me/query`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyA}` },
      body: JSON.stringify({ sql: 'SELECT * FROM meta_account LIMIT 1' }),
    })
    assert.strictEqual(r.status, 400)
  },
})
```

`packages/back/test/tests/users/auth/api-key-pentest.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { startServer } = require('../../../lib/server')
const { createTestApiKey } = require('../../../lib/api-key')
const { createApiKey } = require('../../../../db/api-key')
const { resolveTestUserId } = require('../../../lib/test-user')
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const crypto = require('crypto')
let server, port, baseUrl, rawKey
const query = (userSql) => fetch(`${baseUrl}/api/me/query`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
  body: JSON.stringify({ sql: userSql }),
})

test({
  before: async () => {
    ;({ server, port } = await startServer()); baseUrl = `http://localhost:${port}`
    ;({ raw: rawKey } = await createTestApiKey())
  },
  after: () => server.kill(),
  'rejects stacked queries': async () => {
    assert.strictEqual((await query("SELECT 1; DROP TABLE track")).status, 400)
  },
  'cannot access meta_account via UNION': async () => {
    const r = await query("SELECT 1 UNION SELECT meta_account_user_id FROM meta_account")
    assert.ok([400, 200].includes(r.status))
    if (r.status === 200) assert.ok((await r.json()).rows.every((row) => !('meta_account_user_id' in row)))
  },
  'cannot access meta_session': async () => {
    assert.strictEqual((await query("SELECT * FROM meta_session LIMIT 1")).status, 400)
  },
  'cannot read another user cart': async () => {
    const [{ meta_account_user_id: otherId }] = await pg.queryRowsAsync(sql`
      INSERT INTO meta_account (meta_account_user_id) VALUES (DEFAULT) RETURNING meta_account_user_id
    `)
    const [{ cart_id }] = await pg.queryRowsAsync(sql`
      INSERT INTO cart (cart_name, meta_account_user_id) VALUES ('pentest-cart', ${otherId}) RETURNING cart_id
    `)
    assert.strictEqual((await (await query(`SELECT cart_id FROM cart WHERE cart_id=${cart_id}`)).json()).rows.length, 0)
    await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id=${otherId}`)
  },
  'X-Forwarded-For does not bypass per-key rate limit': async () => {
    const uid = await resolveTestUserId()
    const raw = `fp_pen_rl_${Date.now()}`
    await createApiKey(uid, raw, 'pen-rl')
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    await pg.queryAsync(sql`UPDATE api_key SET rate_limit_per_minute=1 WHERE api_key_hash=${hash}`)
    const hdrs = { Authorization: `Bearer ${raw}`, 'X-Forwarded-For': '1.2.3.4' }
    assert.strictEqual((await fetch(`${baseUrl}/api/me/tracks`, { headers: hdrs })).status, 200)
    assert.strictEqual((await fetch(`${baseUrl}/api/me/tracks`, { headers: hdrs })).status, 429)
  },
})
```

- [ ] **Step 2: Run tests — expect FAIL (404)**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/query.js
```

- [ ] **Step 3: Install node-sql-parser and write RLS migration**

```bash
cd packages/back && npm install node-sql-parser
```

Write `packages/back/migrations/sqls/20260427120000-add-query-rls-up.sql` — see SQL in the design spec at `docs/superpowers/specs/2026-04-27-cli-agent-skill-design.md` (RLS policies section). The SQL creates the `fomoplayer_query` role, grants SELECT on all exposed tables, enables RLS on user-data tables, and creates per-table policies using `current_setting('app.current_user_id')::int`.

Write `packages/back/migrations/sqls/20260427120000-add-query-rls-down.sql` — drops all policies, disables RLS, drops the role.

Write `packages/back/migrations/20260427120000-add-query-rls.js` — same boilerplate as Task 1 Step 1 migration JS wrapper with this filename stem.

- [ ] **Step 4: Run migration**

```bash
cd packages/back && npm run migrate
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx db-migrate -e test up
```

- [ ] **Step 5: Write query endpoint**

`packages/back/routes/users/query.js`:
```javascript
'use strict'
const router = require('express-promise-router')()
const { Parser } = require('node-sql-parser')
const { pool } = require('fomoplayer_shared').db.pg
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const logger = require('fomoplayer_shared').logger(__filename)

const sqlParser = new Parser()
const MAX_ROWS = 500
const EXPOSED_TABLES = [
  'artist','artist__genre','cart','cart__store','genre','key','key_name','key_system',
  'label','playlist','release','release__track','source','store','store__artist',
  'store__artist_watch','store__artist_watch__user','store__genre','store__label',
  'store__label_watch','store__label_watch__user','store__release','store__track',
  'store__track_preview','store__track_preview_embedding','store__track_preview_fingerprint',
  'store__track_preview_fingerprint_meta','store__track_preview_waveform','store_playlist_type',
  'track','track__artist','track__cart','track__genre','track__key','track__label',
  'track_details','user__artist__label_ignore','user__artist_ignore','user__label_ignore',
  'user__playlist_watch','user__release_ignore','user__track','user_notification_audio_sample',
  'user_notification_audio_sample_embedding','user_notification_audio_sample_fingerprint',
  'user_notification_audio_sample_fingerprint_meta','user_search_notification',
  'user_search_notification__store','user_track_score_weight',
]

const isSelectOnly = (userSql) => {
  try {
    const ast = sqlParser.astify(userSql)
    return (Array.isArray(ast) ? ast : [ast]).every((s) => s.type === 'select')
  } catch { return false }
}

router.get('/schema', async (req, res) => {
  const rows = await pg.queryRowsAsync(sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY(${EXPOSED_TABLES})
    ORDER BY table_name, ordinal_position
  `)
  const schema = {}
  for (const { table_name, column_name, data_type } of rows) {
    if (!schema[table_name]) schema[table_name] = []
    schema[table_name].push({ column: column_name, type: data_type })
  }
  res.json(schema)
})

router.post('/', async ({ user: { id: userId }, body: { sql: userSql } }, res) => {
  if (!userSql || typeof userSql !== 'string') return res.status(400).json({ error: 'sql is required' })
  if (!isSelectOnly(userSql)) return res.status(400).json({ error: 'Only SELECT statements are allowed' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE fomoplayer_query')
    await client.query('SET TRANSACTION READ ONLY')
    await client.query("SET LOCAL statement_timeout = '3s'")
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', String(userId)])
    const result = await client.query(userSql)
    await client.query('COMMIT')
    const rows = result.rows.slice(0, MAX_ROWS)
    return res.json({ rows, truncated: result.rows.length > MAX_ROWS })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    logger.warn('Query endpoint error', { message: err?.message })
    if (err.code === '57014') return res.status(408).json({ error: 'Query timed out' })
    return res.status(400).json({ error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router
```

- [ ] **Step 6: Mount in routes/index.js**

Add after the `router.use('/me/api-keys', ...)` line:
```javascript
router.use('/me/query', require('./users/query.js'))
```

- [ ] **Step 7: Run all tests — expect pass**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/query.js
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/query-rls.js
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/auth/api-key-pentest.js
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add \
  packages/back/migrations/20260427120000-add-query-rls.js \
  packages/back/migrations/sqls/20260427120000-add-query-rls-up.sql \
  packages/back/migrations/sqls/20260427120000-add-query-rls-down.sql \
  packages/back/routes/users/query.js \
  packages/back/routes/index.js \
  packages/back/package.json packages/back/package-lock.json \
  packages/back/test/tests/users/query.js \
  packages/back/test/tests/users/query-rls.js \
  packages/back/test/tests/users/auth/api-key-pentest.js
git commit -m "feat: read-only SQL query API with RLS, schema endpoint, and pentest coverage"
```

> **Security review gate:** run `/security-review` before proceeding to Task 5.


---

## Task 5: CLI client + auth + tests

**Files:** `packages/cli/package.json`, `src/config.js`, `src/client.js`, `src/auth.js`, `src/output.js`, `test/lib/server.js`, `test/lib/api-key.js`, `test/client.test.js`

- [ ] **Step 1: Create package.json and install dependencies**

`packages/cli/package.json`:
```json
{
  "name": "fomoplayer_cli",
  "version": "1.0.0",
  "bin": { "fomoplayer": "./bin/fomoplayer.js" },
  "scripts": { "test": "npx cascade-test ./test" },
  "engines": { "node": "22.x" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.2",
    "node-sql-parser": "^5.3.8",
    "open": "^10.1.2",
    "yargs": "^17.7.2"
  },
  "devDependencies": { "cascade-test": "^0.2.3" }
}
```

```bash
mkdir -p packages/cli/bin packages/cli/src/commands packages/cli/mcp packages/cli/test/commands packages/cli/test/mcp packages/cli/test/lib
cd packages/cli && npm install
```

- [ ] **Step 2: Write config.js and output.js**

`packages/cli/src/config.js`:
```javascript
'use strict'
const fs = require('fs'), path = require('path'), os = require('os')
const CONFIG_DIR = path.join(os.homedir(), '.fomoplayer')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const defaults = { apiUrl: 'https://api.fomoplayer.com' }
const read = () => { try { return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) } } catch { return { ...defaults } } }
const write = (data) => { fs.mkdirSync(CONFIG_DIR, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...read(), ...data }, null, 2)) }
module.exports = { read, write, CONFIG_FILE }
```

`packages/cli/src/output.js`:
```javascript
'use strict'
module.exports.printJson = (data) => console.log(JSON.stringify(data, null, 2))
module.exports.printTable = (rows) => {
  if (!rows || rows.length === 0) { console.log('(no results)'); return }
  const keys = Object.keys(rows[0])
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)))
  console.log(keys.map((k, i) => k.padEnd(widths[i])).join('  '))
  console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  for (const row of rows) console.log(keys.map((k, i) => String(row[k] ?? '').padEnd(widths[i])).join('  '))
}
```

- [ ] **Step 3: Write client.js**

`packages/cli/src/client.js`:
```javascript
'use strict'
const { read: readConfig } = require('./config')

class FomoPlayerClient {
  constructor({ apiUrl, apiKey } = {}) {
    const cfg = readConfig()
    this.apiUrl = apiUrl ?? cfg.apiUrl
    this.apiKey = apiKey ?? cfg.apiKey
  }

  async _request(method, path, { body, query } = {}) {
    const url = new URL(path, this.apiUrl)
    if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v))
    const headers = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`
    const res = await fetch(url.toString(), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
    if (res.status === 401) throw Object.assign(new Error('Unauthorized: run `fomoplayer login`'), { code: 'UNAUTHORIZED' })
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after')
      throw Object.assign(new Error(`Rate limit exceeded. Retry after ${retryAfter}s`), { code: 'RATE_LIMITED', retryAfter })
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`)
    if (res.status === 204) return null
    return res.json()
  }

  get(path, opts) { return this._request('GET', path, opts) }
  post(path, body, opts) { return this._request('POST', path, { ...opts, body }) }
  patch(path, body, opts) { return this._request('PATCH', path, { ...opts, body }) }
  delete(path, opts) { return this._request('DELETE', path, opts) }

  getTracks(opts) { return this.get('/api/me/tracks', { query: opts }) }
  markTrackHeard(id, heard = true) { return this.post(`/api/me/tracks/${id}`, { heard }) }
  markAllHeard(heard = true, interval) { return this.patch('/api/me/tracks/', { heard, interval }) }
  undoHeard(since) { return this.delete('/api/me/tracks/heard', { query: { since } }) }

  getArtistFollows(opts) { return this.get('/api/me/follows/artists', { query: opts }) }
  addArtistFollows(body) { return this.post('/api/me/follows/artists', body) }
  removeArtistFollow(id) { return this.delete(`/api/me/follows/artists/${id}`) }
  getLabelFollows(opts) { return this.get('/api/me/follows/labels', { query: opts }) }
  addLabelFollows(body) { return this.post('/api/me/follows/labels', body) }
  removeLabelFollow(id) { return this.delete(`/api/me/follows/labels/${id}`) }
  getPlaylistFollows(opts) { return this.get('/api/me/follows/playlists', { query: opts }) }
  addPlaylistFollows(body) { return this.post('/api/me/follows/playlists', body) }
  removePlaylistFollow(id) { return this.delete(`/api/me/follows/playlists/${id}`) }

  getCarts() { return this.get('/api/me/carts') }
  createCart(name) { return this.post('/api/me/carts', { name }) }
  deleteCart(id) { return this.delete(`/api/me/carts/${id}`) }
  getCartTracks(cartId) { return this.get(`/api/me/carts/${cartId}/tracks`) }
  updateCartTracks(cartId, trackIds, remove = false) { return this.patch(`/api/me/carts/${cartId}/tracks`, { trackIds, remove }) }

  getArtistIgnores() { return this.get('/api/me/ignores/artists') }
  addArtistIgnore(id) { return this.post('/api/me/ignores/artists', { id }) }
  removeArtistIgnore(id) { return this.delete(`/api/me/ignores/artists/${id}`) }
  getLabelIgnores() { return this.get('/api/me/ignores/labels') }
  addLabelIgnore(id) { return this.post('/api/me/ignores/labels', { id }) }
  removeLabelIgnore(id) { return this.delete(`/api/me/ignores/labels/${id}`) }
  addReleaseIgnore(id) { return this.post('/api/me/ignores/releases', { id }) }

  getNotifications() { return this.get('/api/me/notifications') }
  updateNotifications() { return this.post('/api/me/notifications/update', {}) }
  getSearchNotifications() { return this.get('/api/me/notifications/searches') }
  addSearchNotification(string, store) { return this.post('/api/me/notifications/searches', { string, store }) }
  removeSearchNotification(id) { return this.delete(`/api/me/notifications/searches/${id}`) }

  getScoreWeights() { return this.get('/api/me/score-weights') }
  setScoreWeights(weights) { return this.patch('/api/me/score-weights', weights) }
  getSettings() { return this.get('/api/me/settings') }
  setEmail(email) { return this.patch('/api/me/settings/email', { email }) }

  search(type, q, opts) { return this.get(`/api/${type}s/`, { query: { q, ...opts } }) }
  getStores() { return this.get('/api/stores') }
  listApiKeys() { return this.get('/api/me/api-keys') }
  revokeApiKey(id) { return this.delete(`/api/me/api-keys/${id}`) }
  executeQuery(sql) { return this.post('/api/me/query', { sql }) }
  getSchema() { return this.get('/api/me/query/schema') }
}

module.exports = { FomoPlayerClient }
```

- [ ] **Step 4: Write auth.js**

`packages/cli/src/auth.js`:
```javascript
'use strict'
const http = require('http')
const { write: writeConfig, read: readConfig } = require('./config')

const openBrowser = async (url) => { const { default: open } = await import('open'); await open(url) }

const startLocalServer = (port) => new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const token = new URL(req.url, `http://localhost:${port}`).searchParams.get('token')
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<html><body><h2>Login successful. You can close this window.</h2></body></html>')
    server.close()
    resolve(token)
  })
  server.listen(port, '127.0.0.1', () => {})
  server.on('error', reject)
})

module.exports.login = async (apiUrl) => {
  const port = Math.floor(Math.random() * (60000 - 10000) + 10000)
  const tokenPromise = startLocalServer(port)
  const loginUrl = `${apiUrl}/api/auth/login/cli?callbackPort=${port}`
  console.log(`Opening browser for login...\n${loginUrl}`)
  await openBrowser(loginUrl)
  console.log('Waiting for authentication...')
  const token = await tokenPromise
  if (!token) throw new Error('No token received')
  const res = await fetch(`${apiUrl}/api/auth/api-keys/exchange-handoff`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name: 'fomoplayer CLI' }),
  })
  if (!res.ok) throw new Error(`Exchange failed: HTTP ${res.status}`)
  const { key } = await res.json()
  writeConfig({ apiKey: key, apiUrl })
  console.log('Logged in successfully.')
}

module.exports.logout = () => { writeConfig({ apiKey: undefined }); console.log('Logged out.') }
```

- [ ] **Step 5: Write test helpers**

`packages/cli/test/lib/server.js`:
```javascript
'use strict'
const { spawn } = require('child_process'), path = require('path'), net = require('net')
const BACKEND_ROOT = path.resolve(__dirname, '../../../back')
const reservePort = () => new Promise((resolve, reject) => {
  const s = net.createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close((err) => err ? reject(err) : resolve(port)) })
  s.on('error', reject)
})
module.exports.startBackend = async () => {
  const port = await reservePort()
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['index.js'], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, NODE_ENV: 'test', API_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const timeout = setTimeout(() => { server.kill(); reject(new Error('Backend startup timeout')) }, 30000)
    server.stdout.on('data', (d) => {
      if (d.toString().includes('Listening')) {
        clearTimeout(timeout)
        server.stdout.unref(); server.stderr.unref(); server.unref()
        resolve({ server, port, baseUrl: `http://localhost:${port}` })
      }
    })
    server.stderr.on('data', (d) => process.stderr.write(d))
    server.on('error', (err) => { clearTimeout(timeout); reject(err) })
  })
}
```

`packages/cli/test/lib/api-key.js`:
```javascript
'use strict'
const path = require('path')
const { createApiKey } = require(path.resolve(__dirname, '../../../back/db/api-key'))
module.exports.createTestApiKey = async (userId) => {
  const raw = `fp_cli_test_${Date.now()}`
  await createApiKey(userId, raw, 'CLI test key')
  return raw
}
```

- [ ] **Step 6: Write client tests**

`packages/cli/test/client.test.js`:
```javascript
'use strict'
require('dotenv').config({ path: require('path').resolve(__dirname, '../../back/.env.test') })
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/multi-store-player-test'
const assert = require('assert')
const { test } = require('cascade-test')
const { startBackend } = require('./lib/server')
const { createTestApiKey } = require('./lib/api-key')
const { resolveTestUserId } = require('../../back/test/lib/test-user')
const { FomoPlayerClient } = require('../src/client')
let backend, client

test({
  before: async () => {
    backend = await startBackend()
    const userId = await resolveTestUserId()
    const apiKey = await createTestApiKey(userId)
    client = new FomoPlayerClient({ apiUrl: backend.baseUrl, apiKey })
  },
  after: () => backend.server.kill(),
  'getTracks returns object': async () => { assert.ok(typeof await client.getTracks() === 'object') },
  'listApiKeys returns array': async () => { assert.ok(Array.isArray(await client.listApiKeys())) },
  'throws UNAUTHORIZED for missing key': async () => {
    const c = new FomoPlayerClient({ apiUrl: backend.baseUrl, apiKey: undefined })
    await assert.rejects(() => c.getTracks(), (err) => err.code === 'UNAUTHORIZED')
  },
  'executeQuery SELECT works': async () => {
    assert.deepStrictEqual((await client.executeQuery('SELECT 1 AS n')).rows, [{ n: 1 }])
  },
  'executeQuery rejects INSERT client-side': async () => {
    await assert.rejects(() => client.executeQuery("INSERT INTO track VALUES (1)"))
  },
  'getSchema returns table definitions': async () => {
    const schema = await client.getSchema()
    assert.ok(typeof schema === 'object' && (schema.track || schema.artist))
  },
})
```

- [ ] **Step 7: Run client tests — expect pass**

```bash
cd packages/cli && NODE_ENV=test node_modules/.bin/cascade-test ./test/client.test.js
```

Expected: all 6 tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/
git commit -m "feat: CLI package scaffold, config, HTTP client, auth module, and client tests"
```

---

## Task 6: CLI commands + entry point

**Files:** all `packages/cli/src/commands/` modules, `packages/cli/bin/fomoplayer.js`

No integration tests needed beyond the smoke test — the commands are thin wrappers over client methods already tested in Task 5.

- [ ] **Step 1: Write all command modules**

`packages/cli/src/commands/tracks.js`:
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
module.exports = {
  command: 'tracks', describe: 'Manage tracks',
  builder: (y) => y
    .command({ command: 'list', builder: (y) => y.option('store', { type: 'string' }).option('limit', { type: 'number' }).option('json', { type: 'boolean' }),
      handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.getTracks({ store: a.store, limit_new: a.limit }); a.json ? printJson(d) : printTable(d.new ?? d) } })
    .command({ command: 'mark-heard <id>', builder: (y) => y.positional('id', { type: 'string' }).option('json', { type: 'boolean' }),
      handler: async (a) => { const c = new FomoPlayerClient(); const r = await c.markTrackHeard(a.id); a.json ? printJson(r) : console.log(`Heard at: ${r.heardAt}`) } })
    .command({ command: 'mark-heard-all', builder: (y) => y.option('interval', { type: 'string' }).option('json', { type: 'boolean' }),
      handler: async (a) => { const c = new FomoPlayerClient(); const r = await c.markAllHeard(true, a.interval); a.json ? printJson(r) : console.log(`Marked ${r.count} tracks heard at ${r.heardAt}`) } })
    .command({ command: 'undo-heard', builder: (y) => y.option('since', { type: 'string', demandOption: true }),
      handler: async (a) => { await new FomoPlayerClient().undoHeard(a.since); console.log('Done.') } })
    .demandCommand(),
}
```

`packages/cli/src/commands/follows.js`:
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
const sub = (type, list, add, remove) => ({
  command: type, describe: `${type} follows`,
  builder: (y) => y
    .command({ command: 'list', builder: (y) => y.option('store', { type: 'string' }).option('json', { type: 'boolean' }),
      handler: async (a) => { const c = new FomoPlayerClient(); const d = await list(c, a); a.json ? printJson(d) : printTable(d) } })
    .command({ command: 'add <url>', builder: (y) => y.positional('url', { type: 'string' }),
      handler: async (a) => { await add(new FomoPlayerClient(), a); console.log('Done.') } })
    .command({ command: 'remove <id>', builder: (y) => y.positional('id', { type: 'string' }),
      handler: async (a) => { await remove(new FomoPlayerClient(), a); console.log('Done.') } })
    .demandCommand(),
})
module.exports = {
  command: 'follows', describe: 'Manage follows',
  builder: (y) => y
    .command(sub('artists', (c, a) => c.getArtistFollows({ store: a.store }), (c, a) => c.addArtistFollows([{ url: a.url }]), (c, a) => c.removeArtistFollow(a.id)))
    .command(sub('labels', (c, a) => c.getLabelFollows({ store: a.store }), (c, a) => c.addLabelFollows([{ url: a.url }]), (c, a) => c.removeLabelFollow(a.id)))
    .command(sub('playlists', (c, a) => c.getPlaylistFollows({ store: a.store }), (c, a) => c.addPlaylistFollows([{ url: a.url }]), (c, a) => c.removePlaylistFollow(a.id)))
    .demandCommand(),
}
```

`packages/cli/src/commands/carts.js`:
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
module.exports = {
  command: 'carts', describe: 'Manage carts',
  builder: (y) => y
    .command({ command: 'list', builder: (y) => y.option('json', { type: 'boolean' }),
      handler: async (a) => { const d = await new FomoPlayerClient().getCarts(); a.json ? printJson(d) : printTable(d) } })
    .command({ command: 'create <name>', builder: (y) => y.positional('name', { type: 'string' }),
      handler: async (a) => { const d = await new FomoPlayerClient().createCart(a.name); console.log(`Created cart ${d.id ?? d.cart_id}`) } })
    .command({ command: 'delete <id>', builder: (y) => y.positional('id', { type: 'string' }),
      handler: async (a) => { await new FomoPlayerClient().deleteCart(a.id); console.log('Deleted.') } })
    .command({ command: 'tracks', describe: 'Cart track management',
      builder: (y) => y
        .command({ command: 'list <cart-id>', builder: (y) => y.positional('cart-id', { type: 'string' }).option('json', { type: 'boolean' }),
          handler: async (a) => { const d = await new FomoPlayerClient().getCartTracks(a['cart-id']); a.json ? printJson(d) : printTable(d) } })
        .command({ command: 'add <cart-id> [track-ids..]', builder: (y) => y.positional('cart-id', { type: 'string' }).positional('track-ids', { type: 'string' }),
          handler: async (a) => { await new FomoPlayerClient().updateCartTracks(a['cart-id'], a['track-ids']); console.log('Done.') } })
        .command({ command: 'remove <cart-id> [track-ids..]', builder: (y) => y.positional('cart-id', { type: 'string' }).positional('track-ids', { type: 'string' }),
          handler: async (a) => { await new FomoPlayerClient().updateCartTracks(a['cart-id'], a['track-ids'], true); console.log('Done.') } })
        .demandCommand() })
    .demandCommand(),
}
```

`packages/cli/src/commands/ignores.js`:
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
const sub = (type, list, add, remove) => ({ command: type,
  builder: (y) => y
    .command({ command: 'list', builder: (y) => y.option('json', { type: 'boolean' }),
      handler: async (a) => { const d = await list(new FomoPlayerClient()); a.json ? printJson(d) : printTable(d) } })
    .command({ command: 'add <id>', builder: (y) => y.positional('id', { type: 'string' }),
      handler: async (a) => { await add(new FomoPlayerClient(), a.id); console.log('Done.') } })
    .command({ command: 'remove <id>', builder: (y) => y.positional('id', { type: 'string' }),
      handler: async (a) => { await remove(new FomoPlayerClient(), a.id); console.log('Done.') } })
    .demandCommand() })
module.exports = {
  command: 'ignores', describe: 'Manage ignores',
  builder: (y) => y
    .command(sub('artists', (c) => c.getArtistIgnores(), (c, id) => c.addArtistIgnore(id), (c, id) => c.removeArtistIgnore(id)))
    .command(sub('labels', (c) => c.getLabelIgnores(), (c, id) => c.addLabelIgnore(id), (c, id) => c.removeLabelIgnore(id)))
    .command({ command: 'releases', builder: (y) => y
      .command({ command: 'add <id>', builder: (y) => y.positional('id', { type: 'string' }),
        handler: async (a) => { await new FomoPlayerClient().addReleaseIgnore(a.id); console.log('Done.') } })
      .demandCommand() })
    .demandCommand(),
}
```

`packages/cli/src/commands/notifications.js`:
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
module.exports = {
  command: 'notifications', describe: 'Manage notifications',
  builder: (y) => y
    .command({ command: 'list', builder: (y) => y.option('json', { type: 'boolean' }),
      handler: async (a) => { const d = await new FomoPlayerClient().getNotifications(); a.json ? printJson(d) : printTable(d) } })
    .command({ command: 'update', handler: async () => { await new FomoPlayerClient().updateNotifications(); console.log('Done.') } })
    .command({ command: 'search', builder: (y) => y
      .command({ command: 'list', builder: (y) => y.option('json', { type: 'boolean' }),
        handler: async (a) => { const d = await new FomoPlayerClient().getSearchNotifications(); a.json ? printJson(d) : printTable(d) } })
      .command({ command: 'add <string>', builder: (y) => y.positional('string', { type: 'string' }).option('store', { type: 'string' }),
        handler: async (a) => { await new FomoPlayerClient().addSearchNotification(a.string, a.store); console.log('Done.') } })
      .command({ command: 'remove <id>', builder: (y) => y.positional('id', { type: 'string' }),
        handler: async (a) => { await new FomoPlayerClient().removeSearchNotification(a.id); console.log('Done.') } })
      .demandCommand() })
    .demandCommand(),
}
```

`packages/cli/src/commands/settings.js` (exports array of two commands):
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printJson } = require('../output')
module.exports = [
  { command: 'score-weights', describe: 'Score weight config',
    builder: (y) => y
      .command({ command: 'get', builder: (y) => y.option('json', { type: 'boolean' }),
        handler: async (a) => { printJson(await new FomoPlayerClient().getScoreWeights()) } })
      .command({ command: 'set <json>', builder: (y) => y.positional('json', { type: 'string' }),
        handler: async (a) => { await new FomoPlayerClient().setScoreWeights(JSON.parse(a.json)); console.log('Done.') } })
      .demandCommand() },
  { command: 'settings', describe: 'Account settings',
    builder: (y) => y
      .command({ command: 'get', handler: async () => { printJson(await new FomoPlayerClient().getSettings()) } })
      .command({ command: 'set-email <email>', builder: (y) => y.positional('email', { type: 'string' }),
        handler: async (a) => { await new FomoPlayerClient().setEmail(a.email); console.log('Done.') } })
      .demandCommand() },
]
```

`packages/cli/src/commands/api-keys.js`:
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
module.exports = {
  command: 'keys', describe: 'Manage API keys',
  builder: (y) => y
    .command({ command: 'list', builder: (y) => y.option('json', { type: 'boolean' }),
      handler: async (a) => { const d = await new FomoPlayerClient().listApiKeys(); a.json ? printJson(d) : printTable(d) } })
    .command({ command: 'revoke <id>', builder: (y) => y.positional('id', { type: 'string' }),
      handler: async (a) => { await new FomoPlayerClient().revokeApiKey(a.id); console.log('Revoked.') } })
    .demandCommand(),
}
```

`packages/cli/src/commands/query.js` (exports array of two commands):
```javascript
'use strict'
const fs = require('fs')
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
module.exports = [
  { command: 'schema', describe: 'Print exposable tables and columns',
    builder: (y) => y.option('json', { type: 'boolean' }),
    handler: async (a) => { printJson(await new FomoPlayerClient().getSchema()) } },
  { command: 'query <sql>', describe: 'Execute a read-only SQL query',
    builder: (y) => y.positional('sql', { type: 'string' }).option('file', { type: 'string', alias: 'f' }).option('json', { type: 'boolean' }),
    handler: async (a) => {
      const sqlStr = a.file ? fs.readFileSync(a.file, 'utf8') : a.sql
      const d = await new FomoPlayerClient().executeQuery(sqlStr)
      if (d.truncated) console.error('Warning: results truncated at 500 rows')
      a.json ? printJson(d.rows) : printTable(d.rows)
    } },
]
```

`packages/cli/src/commands/search.js`:
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
module.exports = {
  command: 'search <type> <query>', describe: 'Search artists, labels, or tracks',
  builder: (y) => y.positional('type', { choices: ['artists', 'labels', 'tracks'] }).positional('query', { type: 'string' }).option('json', { type: 'boolean' }),
  handler: async (a) => { const d = await new FomoPlayerClient().search(a.type, a.query); a.json ? printJson(d) : printTable(Array.isArray(d) ? d : [d]) },
}
```

`packages/cli/src/commands/stores.js`:
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
module.exports = {
  command: 'stores', describe: 'List available stores',
  builder: (y) => y.option('json', { type: 'boolean' }),
  handler: async (a) => { const d = await new FomoPlayerClient().getStores(); a.json ? printJson(d) : printTable(d) },
}
```

`packages/cli/src/commands/config.js`:
```javascript
'use strict'
const { read: readConfig, write: writeConfig } = require('../config')
const { printJson } = require('../output')
module.exports = {
  command: 'config', describe: 'Manage CLI configuration',
  builder: (y) => y
    .command({ command: 'get', handler: () => printJson(readConfig()) })
    .command({ command: 'set <key> <value>', builder: (y) => y.positional('key', { type: 'string' }).positional('value', { type: 'string' }),
      handler: (a) => { writeConfig({ [a.key]: a.value }); console.log('Done.') } })
    .demandCommand(),
}
```

- [ ] **Step 2: Write the entry point**

`packages/cli/bin/fomoplayer.js`:
```javascript
#!/usr/bin/env node
'use strict'
const yargs = require('yargs')
const { login, logout } = require('../src/auth')
const { read: readConfig } = require('../src/config')
const [scoreWeights, settings] = require('../src/commands/settings')
const [schema, query] = require('../src/commands/query')

yargs
  .command({ command: 'login', describe: 'Authenticate with Fomo Player',
    handler: async () => { await login(readConfig().apiUrl) } })
  .command({ command: 'logout', describe: 'Remove stored credentials', handler: logout })
  .command(require('../src/commands/tracks'))
  .command(require('../src/commands/follows'))
  .command(require('../src/commands/carts'))
  .command(require('../src/commands/ignores'))
  .command(require('../src/commands/notifications'))
  .command(scoreWeights)
  .command(settings)
  .command(require('../src/commands/api-keys'))
  .command(schema)
  .command(query)
  .command(require('../src/commands/search'))
  .command(require('../src/commands/stores'))
  .command(require('../src/commands/config'))
  .command({ command: 'mcp', describe: 'Start the MCP server (stdio)', handler: () => require('../mcp/server') })
  .completion('completion')
  .demandCommand()
  .help()
  .strict()
  .parse()
```

- [ ] **Step 3: Make executable and smoke-test**

```bash
chmod +x packages/cli/bin/fomoplayer.js
node packages/cli/bin/fomoplayer.js --help
node packages/cli/bin/fomoplayer.js tracks --help
```

Expected: help output listing all commands without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/ packages/cli/bin/fomoplayer.js
git commit -m "feat: CLI command modules and fomoplayer entry point"
```

---

## Task 7: MCP server + tests + settings.json

**Files:** `packages/cli/mcp/tools.js`, `packages/cli/mcp/server.js`, `packages/cli/test/mcp/tools.test.js`, `.claude/settings.json`

- [ ] **Step 1: Write tools.js**

`packages/cli/mcp/tools.js`:
```javascript
'use strict'
const { Parser } = require('node-sql-parser')
const sqlParser = new Parser()
const isSelectOnly = (sql) => {
  try { return (Array.isArray(sqlParser.astify(sql)) ? sqlParser.astify(sql) : [sqlParser.astify(sql)]).every((s) => s.type === 'select') }
  catch { return false }
}

module.exports.defineTools = (client) => [
  { name: 'get_schema', description: 'Returns all exposable table names with columns and types.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => client.getSchema() },
  { name: 'execute_query', description: 'Executes a read-only SQL SELECT. Results capped at 500 rows.',
    inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
    handler: async ({ sql }) => { if (!isSelectOnly(sql)) throw new Error('Only SELECT statements are allowed'); return client.executeQuery(sql) } },
  { name: 'get_tracks', description: 'List tracks.',
    inputSchema: { type: 'object', properties: { store: { type: 'string' }, limit: { type: 'number' } } },
    handler: async ({ store, limit } = {}) => client.getTracks({ store, limit_new: limit }) },
  { name: 'mark_track_heard', description: 'Mark one track heard. Returns { heardAt }.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async ({ id }) => client.markTrackHeard(id) },
  { name: 'mark_all_heard', description: 'Mark all tracks heard. Returns { heardAt, count }.',
    inputSchema: { type: 'object', properties: { interval: { type: 'string' } } },
    handler: async ({ interval } = {}) => client.markAllHeard(true, interval) },
  { name: 'undo_mark_heard', description: 'Clear heard status for tracks marked at or after since.',
    inputSchema: { type: 'object', properties: { since: { type: 'string' } }, required: ['since'] },
    handler: async ({ since }) => client.undoHeard(since) },
  { name: 'list_follows', description: 'List followed artists, labels, or playlists.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists','labels','playlists'] }, store: { type: 'string' } }, required: ['type'] },
    handler: async ({ type, store }) => type === 'artists' ? client.getArtistFollows({ store }) : type === 'labels' ? client.getLabelFollows({ store }) : client.getPlaylistFollows({ store }) },
  { name: 'add_follow', description: 'Follow an artist, label, or playlist by URL.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists','labels','playlists'] }, url: { type: 'string' } }, required: ['type','url'] },
    handler: async ({ type, url }) => type === 'artists' ? client.addArtistFollows([{ url }]) : type === 'labels' ? client.addLabelFollows([{ url }]) : client.addPlaylistFollows([{ url }]) },
  { name: 'remove_follow', description: 'Unfollow by ID.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists','labels','playlists'] }, id: { type: 'string' } }, required: ['type','id'] },
    handler: async ({ type, id }) => type === 'artists' ? client.removeArtistFollow(id) : type === 'labels' ? client.removeLabelFollow(id) : client.removePlaylistFollow(id) },
  { name: 'list_ignores', description: 'List ignored artists or labels.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists','labels'] } }, required: ['type'] },
    handler: async ({ type }) => type === 'artists' ? client.getArtistIgnores() : client.getLabelIgnores() },
  { name: 'add_ignore', description: 'Ignore an artist, label, or release.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists','labels','releases'] }, id: { type: 'string' } }, required: ['type','id'] },
    handler: async ({ type, id }) => type === 'artists' ? client.addArtistIgnore(id) : type === 'labels' ? client.addLabelIgnore(id) : client.addReleaseIgnore(id) },
  { name: 'remove_ignore', description: 'Remove an ignore.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists','labels'] }, id: { type: 'string' } }, required: ['type','id'] },
    handler: async ({ type, id }) => type === 'artists' ? client.removeArtistIgnore(id) : client.removeLabelIgnore(id) },
  { name: 'list_carts', description: 'List all carts.',
    inputSchema: { type: 'object', properties: {} }, handler: async () => client.getCarts() },
  { name: 'create_cart', description: 'Create a cart.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => client.createCart(name) },
  { name: 'delete_cart', description: 'Delete a cart.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async ({ id }) => client.deleteCart(id) },
  { name: 'list_cart_tracks', description: 'List tracks in a cart.',
    inputSchema: { type: 'object', properties: { cartId: { type: 'string' } }, required: ['cartId'] },
    handler: async ({ cartId }) => client.getCartTracks(cartId) },
  { name: 'update_cart_tracks', description: 'Add or remove tracks from a cart.',
    inputSchema: { type: 'object', properties: { cartId: { type: 'string' }, trackIds: { type: 'array', items: { type: 'string' } }, remove: { type: 'boolean' } }, required: ['cartId','trackIds'] },
    handler: async ({ cartId, trackIds, remove = false }) => client.updateCartTracks(cartId, trackIds, remove) },
  { name: 'list_search_notifications', description: 'List keyword search notifications.',
    inputSchema: { type: 'object', properties: {} }, handler: async () => client.getSearchNotifications() },
  { name: 'add_search_notification', description: 'Add a keyword search notification.',
    inputSchema: { type: 'object', properties: { string: { type: 'string' }, store: { type: 'string' } }, required: ['string'] },
    handler: async ({ string, store }) => client.addSearchNotification(string, store) },
  { name: 'remove_search_notification', description: 'Remove a search notification.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async ({ id }) => client.removeSearchNotification(id) },
  { name: 'get_score_weights', description: 'Get score weights.',
    inputSchema: { type: 'object', properties: {} }, handler: async () => client.getScoreWeights() },
  { name: 'set_score_weights', description: 'Update score weights.',
    inputSchema: { type: 'object', properties: { weights: { type: 'object' } }, required: ['weights'] },
    handler: async ({ weights }) => client.setScoreWeights(weights) },
  { name: 'get_settings', description: 'Get account settings.',
    inputSchema: { type: 'object', properties: {} }, handler: async () => client.getSettings() },
  { name: 'set_email', description: 'Update email address.',
    inputSchema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
    handler: async ({ email }) => client.setEmail(email) },
  { name: 'search', description: 'Search artists, labels, or tracks.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists','labels','tracks'] }, query: { type: 'string' } }, required: ['type','query'] },
    handler: async ({ type, query }) => client.search(type, query) },
  { name: 'list_stores', description: 'List available stores.',
    inputSchema: { type: 'object', properties: {} }, handler: async () => client.getStores() },
  { name: 'list_api_keys', description: 'List active API keys.',
    inputSchema: { type: 'object', properties: {} }, handler: async () => client.listApiKeys() },
  { name: 'revoke_api_key', description: 'Revoke an API key.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async ({ id }) => client.revokeApiKey(id) },
]
```

- [ ] **Step 2: Write server.js**

`packages/cli/mcp/server.js`:
```javascript
#!/usr/bin/env node
'use strict'
const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js')
const { FomoPlayerClient } = require('../src/client')
const { defineTools } = require('./tools')

const client = new FomoPlayerClient()
const tools = defineTools(client)
const server = new Server({ name: 'fomoplayer', version: '1.0.0' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}))
server.setRequestHandler(CallToolRequestSchema, async ({ params: { name, arguments: args } }) => {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await tool.handler(args ?? {}), null, 2) }] }
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
  }
})
server.connect(new StdioServerTransport()).catch((err) => { process.stderr.write(`MCP error: ${err.message}\n`); process.exit(1) })
```

- [ ] **Step 3: Write MCP tests**

`packages/cli/test/mcp/tools.test.js`:
```javascript
'use strict'
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../back/.env.test') })
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/multi-store-player-test'
const assert = require('assert')
const { test } = require('cascade-test')
const { startBackend } = require('../lib/server')
const { createTestApiKey } = require('../lib/api-key')
const { resolveTestUserId } = require('../../../back/test/lib/test-user')
const { FomoPlayerClient } = require('../../src/client')
const { defineTools } = require('../../mcp/tools')
let backend, tools

test({
  before: async () => {
    backend = await startBackend()
    const userId = await resolveTestUserId()
    const apiKey = await createTestApiKey(userId)
    tools = defineTools(new FomoPlayerClient({ apiUrl: backend.baseUrl, apiKey }))
  },
  after: () => backend.server.kill(),
  'get_schema returns table definitions': async () => {
    const schema = await tools.find((t) => t.name === 'get_schema').handler({})
    assert.ok(schema.track || schema.artist)
  },
  'execute_query rejects non-SELECT client-side': async () => {
    await assert.rejects(() => tools.find((t) => t.name === 'execute_query').handler({ sql: 'DELETE FROM track' }))
  },
  'get_tracks returns object': async () => {
    assert.ok(typeof await tools.find((t) => t.name === 'get_tracks').handler({}) === 'object')
  },
  'list_carts returns array': async () => {
    assert.ok(Array.isArray(await tools.find((t) => t.name === 'list_carts').handler({})))
  },
})
```

- [ ] **Step 4: Write .claude/settings.json**

Check if `.claude/settings.json` exists:
```bash
ls .claude/settings.json 2>/dev/null && echo exists || echo missing
```

If missing, create it:
```json
{
  "mcpServers": {
    "fomoplayer": {
      "command": "fomoplayer",
      "args": ["mcp"]
    }
  }
}
```

If it exists, merge the `mcpServers` key into the existing JSON — do not overwrite other keys.

- [ ] **Step 5: Run MCP tests — expect pass**

```bash
cd packages/cli && NODE_ENV=test node_modules/.bin/cascade-test ./test/mcp/tools.test.js
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/mcp/ packages/cli/test/mcp/ .claude/settings.json
git commit -m "feat: MCP server with all tool definitions and MCP integration tests"
```

---

## Task 8: Agent skill file

**Files:** `.claude/skills/fomoplayer.md`

- [ ] **Step 1: Create skills directory and write skill file**

```bash
mkdir -p .claude/skills
```

`.claude/skills/fomoplayer.md`:
```markdown
---
name: fomoplayer
description: Use when the user asks you to do anything with their Fomo Player music library — discovering tracks, managing follows/carts/ignores, running analytics queries, or bulk operations.
---

# Fomo Player Agent Skill

You have access to a Fomo Player MCP server. Use it to help the user manage their music library.

## When to use this skill

- User mentions Fomo Player, tracks, carts, follows, ignores, or search notifications
- User asks for data analysis ("unheard tracks at 128 BPM")
- User wants bulk operations (mark heard, add to cart, follow many artists)

## Standard workflow

1. `get_schema()` — understand available columns before writing SQL
2. `execute_query(sql)` — fetch IDs or rows with a SELECT
3. Structured write tool — use result IDs for mutations (e.g. `update_cart_tracks`)

Never write raw SQL for mutations. Always use the structured tools for writes.

## Common patterns

### Find tracks by BPM + store, add to cart
```
get_schema()
execute_query("SELECT st.track_id FROM store__track st JOIN store s ON s.store_id = st.store_id LEFT JOIN user__track ut ON ut.track_id = st.track_id WHERE s.store_name = 'beatport' AND st.store__track_bpm BETWEEN 125 AND 130 AND ut.user__track_heard IS NULL")
update_cart_tracks(cartId, [trackIds…])
```

### Embedding similarity search
```
execute_query("SELECT t.track_id, 1 - (e.embedding <=> (SELECT embedding FROM store__track_preview_embedding WHERE track_id = <seed_id> LIMIT 1)) AS similarity FROM store__track_preview_embedding e JOIN track t ON t.track_id = e.track_id ORDER BY similarity DESC LIMIT 20")
```

### Undo accidental mark-all-heard
Save the `heardAt` from `mark_all_heard`, then call `undo_mark_heard(since: heardAt)` to reverse it.

## Rate limits

Default: 60 req/min, 1000/day. Avoid tight loops — batch reads with `execute_query` rather than querying one record at a time.

## Exposable tables

Global (no RLS): `artist`, `label`, `track`, `store`, `store__track`, `release`, `genre`, `key`, `playlist`, `source`, `cart__store`, `track_details`, and all join/embedding tables.

User data (RLS, own rows only): `cart`, `user__track`, `track__cart`, `user__artist_ignore`, `user__label_ignore`, `user__playlist_watch`, `user_search_notification`, `user_track_score_weight`, `user_notification_audio_sample` (and subtables).

Not accessible: `meta_account`, `meta_session`, and all other internal tables.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/fomoplayer.md
git commit -m "feat: Claude agent skill file for Fomo Player MCP server"
```

---

## Task 9: Full test suite verification

- [ ] **Step 1: Run all backend tests**

```bash
cd packages/back && npm test
```

Expected: all existing and new tests pass.

- [ ] **Step 2: Run all CLI tests**

```bash
cd packages/cli && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Smoke-test CLI binary**

```bash
node packages/cli/bin/fomoplayer.js --help
node packages/cli/bin/fomoplayer.js tracks --help
node packages/cli/bin/fomoplayer.js query --help
```

Expected: all commands listed, no errors.
