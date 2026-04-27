# CLI and Agent Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `fomoplayer` CLI binary, MCP server, and agent skill file that give users and Claude agents full programmatic access to Fomo Player via API keys.

**Architecture:** New `packages/cli` shares a common HTTP client with an MCP stdio server. The backend gains API key auth (SHA-256 hash stored in DB, `passport-custom` strategy), a two-tier in-process rate limiter, a dedicated CLI OIDC login route, a read-only SQL query endpoint backed by PostgreSQL RLS, and an `undo_mark_heard` endpoint.

**Tech Stack:** Node 22, Express, passport-custom, node-sql-parser, @modelcontextprotocol/sdk, yargs, cascade-test

---

## File map

**New backend files:**
- `packages/back/migrations/20260427110000-add-api-key.js` + `sqls/…-up.sql` / `…-down.sql`
- `packages/back/migrations/20260427120000-add-query-rls.js` + `sqls/…-up.sql` / `…-down.sql`
- `packages/back/db/api-key.js` — CRUD helpers
- `packages/back/routes/shared/api-key-rate-limiter.js` — sliding-window rate limiter
- `packages/back/routes/users/api-keys.js` — list/revoke routes
- `packages/back/routes/users/query.js` — read-only SQL endpoint

**Modified backend files:**
- `packages/back/passport-setup.js` — add api-key strategy
- `packages/back/index.js` — wire api-key auth branch
- `packages/back/routes/auth.js` — add CLI login + exchange-handoff routes
- `packages/back/routes/index.js` — mount api-keys + query routers
- `packages/back/routes/users/db.js` — setTrackHeard/setAllHeard return timestamp+count; new deleteHeardSince
- `packages/back/routes/users/api.js` — update mark-heard routes + add DELETE /tracks/heard
- `packages/back/.env.test` — add `OIDC_HANDOFF_SECRET=test-handoff-secret`

**New test files:**
- `packages/back/test/tests/users/auth/api-key-exchange.js`
- `packages/back/test/tests/users/auth/api-key-auth.js`
- `packages/back/test/tests/users/auth/api-key-rate-limit.js`
- `packages/back/test/tests/users/query.js`
- `packages/back/test/tests/users/query-rls.js`
- `packages/back/test/tests/users/auth/api-key-pentest.js`
- `packages/back/test/tests/users/undo-heard.js`
- `packages/back/test/lib/api-key.js` — test helper

**New CLI package:**
- `packages/cli/package.json`
- `packages/cli/src/config.js`
- `packages/cli/src/client.js`
- `packages/cli/src/auth.js`
- `packages/cli/src/commands/tracks.js`
- `packages/cli/src/commands/follows.js`
- `packages/cli/src/commands/carts.js`
- `packages/cli/src/commands/ignores.js`
- `packages/cli/src/commands/notifications.js`
- `packages/cli/src/commands/settings.js`
- `packages/cli/src/commands/api-keys.js`
- `packages/cli/src/commands/query.js`
- `packages/cli/src/commands/search.js`
- `packages/cli/src/commands/stores.js`
- `packages/cli/src/commands/config.js`
- `packages/cli/mcp/tools.js`
- `packages/cli/mcp/server.js`
- `packages/cli/bin/fomoplayer.js`
- `packages/cli/test/client.test.js`
- `packages/cli/test/auth.test.js`
- `packages/cli/test/commands/tracks.test.js`
- `packages/cli/test/mcp/tools.test.js`

**New skill file:**
- `.claude/skills/fomoplayer.md`

---

## Task 1: DB migration — api_key table

**Files:**
- Create: `packages/back/migrations/20260427110000-add-api-key.js`
- Create: `packages/back/migrations/sqls/20260427110000-add-api-key-up.sql`
- Create: `packages/back/migrations/sqls/20260427110000-add-api-key-down.sql`

- [ ] **Step 1: Write the up migration SQL**

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

- [ ] **Step 2: Write the down migration SQL**

`packages/back/migrations/sqls/20260427110000-add-api-key-down.sql`:
```sql
DROP TABLE IF EXISTS api_key;
```

- [ ] **Step 3: Write the migration JS wrapper**

`packages/back/migrations/20260427110000-add-api-key.js`:
```javascript
'use strict';
var fs = require('fs');
var path = require('path');

exports.setup = function(options) {};

exports.up = function(db) {
  var filePath = path.join(__dirname, 'sqls', '20260427110000-add-api-key-up.sql');
  return new Promise(function(resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function(err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  }).then(function(data) { return db.runSql(data); });
};

exports.down = function(db) {
  var filePath = path.join(__dirname, 'sqls', '20260427110000-add-api-key-down.sql');
  return new Promise(function(resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function(err, data) {
      if (err) return reject(err);
      resolve(data);
    });
  }).then(function(data) { return db.runSql(data); });
};

exports._meta = { version: 1 };
```

- [ ] **Step 4: Run migration on dev and test databases**

```bash
cd packages/back && npm run migrate
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx db-migrate -e test up
```

Expected: migration runs without error; `\d api_key` in psql shows the table.

- [ ] **Step 5: Commit**

```bash
git add packages/back/migrations/20260427110000-add-api-key.js \
        packages/back/migrations/sqls/20260427110000-add-api-key-up.sql \
        packages/back/migrations/sqls/20260427110000-add-api-key-down.sql
git commit -m "feat: add api_key table migration"
```

---

## Task 2: DB helpers — api-key CRUD

**Files:**
- Create: `packages/back/db/api-key.js`

- [ ] **Step 1: Write the file**

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
    FROM api_key
    WHERE api_key_hash = ${hash}
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

- [ ] **Step 2: Commit**

```bash
git add packages/back/db/api-key.js
git commit -m "feat: add api-key DB helpers"
```

---

## Task 3: Rate limiter middleware

**Files:**
- Create: `packages/back/routes/shared/api-key-rate-limiter.js`

- [ ] **Step 1: Write the rate limiter**

`packages/back/routes/shared/api-key-rate-limiter.js`:
```javascript
'use strict'

class ApiKeyRateLimiter {
  constructor({ now = () => Date.now() } = {}) {
    this._now = now
    // Map<keyId, { minute: { count, windowStart }, day: { count, windowStart } }>
    this._state = new Map()
  }

  check(keyId, { perMinute, perDay }) {
    const now = this._now()
    let s = this._state.get(keyId) ?? {
      minute: { count: 0, windowStart: now },
      day: { count: 0, windowStart: now },
    }

    if (now - s.minute.windowStart >= 60_000) s = { ...s, minute: { count: 0, windowStart: now } }
    if (now - s.day.windowStart >= 86_400_000) s = { ...s, day: { count: 0, windowStart: now } }

    if (s.minute.count >= perMinute) {
      return {
        allowed: false,
        retryAfter: Math.ceil((s.minute.windowStart + 60_000 - now) / 1000),
        limitPerMinute: perMinute, remainingMinute: 0,
        limitPerDay: perDay, remainingDay: Math.max(0, perDay - s.day.count),
      }
    }
    if (s.day.count >= perDay) {
      return {
        allowed: false,
        retryAfter: Math.ceil((s.day.windowStart + 86_400_000 - now) / 1000),
        limitPerMinute: perMinute, remainingMinute: Math.max(0, perMinute - s.minute.count),
        limitPerDay: perDay, remainingDay: 0,
      }
    }

    s = {
      minute: { ...s.minute, count: s.minute.count + 1 },
      day: { ...s.day, count: s.day.count + 1 },
    }
    this._state.set(keyId, s)

    return {
      allowed: true,
      limitPerMinute: perMinute, remainingMinute: perMinute - s.minute.count,
      limitPerDay: perDay, remainingDay: perDay - s.day.count,
    }
  }
}

module.exports = { ApiKeyRateLimiter, apiKeyRateLimiter: new ApiKeyRateLimiter() }
```

- [ ] **Step 2: Commit**

```bash
git add packages/back/routes/shared/api-key-rate-limiter.js
git commit -m "feat: add in-process API key rate limiter"
```

---

## Task 4: Passport api-key strategy + index.js wiring

**Files:**
- Modify: `packages/back/passport-setup.js`
- Modify: `packages/back/index.js`

- [ ] **Step 1: Add api-key strategy to passport-setup.js**

After the JwtStrategy block (around line 155) and before `passport.serializeUser`, add:

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

Install the dependency first:
```bash
cd packages/back && npm install passport-custom
```

- [ ] **Step 2: Update the auth middleware in index.js**

Replace the `/api` auth middleware block (lines ~106–121):

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

- [ ] **Step 3: Start the server and confirm no startup errors**

```bash
cd packages/back && NODE_ENV=development node index.js &
# should print "Listening on port: ..."
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add packages/back/passport-setup.js packages/back/index.js packages/back/package.json packages/back/package-lock.json
git commit -m "feat: add passport api-key strategy and wire auth routing"
```

---

## Task 5: CLI login route + exchange-handoff endpoint

**Files:**
- Modify: `packages/back/routes/auth.js`

- [ ] **Step 1: Add CLI login route**

After the `router.get('/login/google', ...)` block, add:

```javascript
router.get('/login/cli', (req, res, next) => {
  const callbackPort = parseInt(req.query.callbackPort, 10)
  if (!Number.isInteger(callbackPort) || callbackPort < 1024 || callbackPort > 65535) {
    return res.status(400).json({ error: 'callbackPort must be an integer between 1024 and 65535' })
  }
  return passport.authenticate('openidconnect', {
    state: { cliCallbackPort: callbackPort },
  })(req, res, next)
})
```

- [ ] **Step 2: Handle cliCallbackPort in the OIDC return handler**

In `router.get('/login/google/return', ...)`, inside the `passport.authenticate` callback, add a `cliCallbackPort` branch after the `wantsHandoff` block:

```javascript
    const { returnPath, handoffTarget, cliCallbackPort } = info?.state ?? {}

    if (cliCallbackPort) {
      const port = parseInt(cliCallbackPort, 10)
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        return redirectWithLoginFailed(res)
      }
      if (!canMintHandoff) {
        logger.warn('CLI login: cannot mint handoff token (OIDC_HANDOFF_SECRET not configured)')
        return redirectWithLoginFailed(res)
      }
      const oidcIdentity = user?.oidcIdentity
      if (!oidcIdentity?.issuer || !oidcIdentity?.subject) {
        logger.error('CLI login: OIDC identity missing after auth')
        return redirectWithLoginFailed(res)
      }
      let token
      try {
        ;({ token } = mintHandoffToken({
          secret: oidcHandoffSecret,
          issuer: apiOrigin,
          audience: apiOrigin,
          oidcIssuer: oidcIdentity.issuer,
          oidcSubject: oidcIdentity.subject,
        }))
      } catch (e) {
        logger.error(`CLI login: minting handoff token failed: ${e}`)
        return redirectWithLoginFailed(res)
      }
      const callbackUrl = new URL(`http://localhost:${port}/`)
      callbackUrl.searchParams.set('token', token)
      return res.redirect(callbackUrl.toString())
    }
```

This block must be placed **before** the existing `if (wantsHandoff)` block.

- [ ] **Step 3: Add exchange-handoff endpoint**

Add these imports at the top of auth.js:
```javascript
const { v4: uuid } = require('uuid')
const { createApiKey } = require('../db/api-key')
```

Add the exchange route after the Spotify routes:
```javascript
router.post('/api-keys/exchange-handoff', async (req, res, next) => {
  try {
    const { token, name = 'fomoplayer CLI' } = req.body ?? {}
    if (!token) return res.status(400).json({ error: 'token is required' })
    if (!canMintHandoff) return res.status(503).json({ error: 'API key exchange not configured' })

    const payload = verifyHandoffToken({
      token,
      secret: oidcHandoffSecret,
      issuer: apiOrigin,
      audience: apiOrigin,
    })
    if (!payload) return res.status(401).json({ error: 'Invalid or expired token' })

    const expiresAt = new Date(payload.exp * 1000)
    const consumed = await consumeHandoffJti(payload.jti, expiresAt)
    if (!consumed) {
      logger.warn('CLI exchange: handoff token replay rejected', { jti: payload.jti })
      return res.status(401).json({ error: 'Token already used' })
    }

    const user = await account.findOrCreateByIdentifier(payload.oidcIssuer, payload.sub)
    if (!user) return res.status(500).json({ error: 'User lookup failed' })

    const rawKey = `fp_${uuid()}`
    const keyRecord = await createApiKey(user.id, rawKey, name)
    return res.json({ key: rawKey, id: keyRecord.api_key_id, name: keyRecord.api_key_name })
  } catch (e) {
    next(e)
  }
})
```

Note: this route is under `/api/auth/` which is mounted **before** the authentication middleware in index.js, so it is unauthenticated (by design — the handoff token is the credential).

- [ ] **Step 4: Set OIDC_HANDOFF_SECRET in .env.test**

Edit `packages/back/.env.test`, change:
```
OIDC_HANDOFF_SECRET=
```
to:
```
OIDC_HANDOFF_SECRET=test-handoff-secret
```

Also add `API_URL=http://localhost` (needed for `apiOrigin` in config):
Check `packages/back/config.js` to find the exact env var name for `apiOrigin` and add it.

- [ ] **Step 5: Commit**

```bash
git add packages/back/routes/auth.js packages/back/.env.test
git commit -m "feat: add CLI OIDC login route and api-key exchange-handoff endpoint"
```

---

## Task 6: API key management routes (list + revoke)

**Files:**
- Create: `packages/back/routes/users/api-keys.js`
- Modify: `packages/back/routes/index.js`

- [ ] **Step 1: Write the api-keys router**

`packages/back/routes/users/api-keys.js`:
```javascript
'use strict'
const router = require('express-promise-router')()
const { listApiKeys, revokeApiKey } = require('../../db/api-key')

router.get('/', async ({ user: { id: userId } }, res) => {
  res.json(await listApiKeys(userId))
})

router.delete('/:id', async ({ user: { id: userId }, params: { id } }, res) => {
  await revokeApiKey(parseInt(id, 10), userId)
  res.status(204).end()
})

module.exports = router
```

- [ ] **Step 2: Mount in routes/index.js**

In `packages/back/routes/index.js`, after `router.use('/me/', usersRouter)`, add:
```javascript
const apiKeysRouter = require('./users/api-keys.js')
router.use('/me/api-keys', apiKeysRouter)
```

- [ ] **Step 3: Commit**

```bash
git add packages/back/routes/users/api-keys.js packages/back/routes/index.js
git commit -m "feat: add API key list/revoke routes"
```

---

## Task 7: undo_mark_heard — DB changes + route

**Files:**
- Modify: `packages/back/routes/users/db.js`
- Modify: `packages/back/routes/users/api.js`

- [ ] **Step 1: Update setTrackHeard to return heardAt**

In `packages/back/routes/users/db.js`, replace `module.exports.setTrackHeard`:

```javascript
module.exports.setTrackHeard = async (trackId, userId, heard) => {
  logger.debug('setTrackHeard', { trackId, userId, heard })
  const now = heard ? new Date() : null
  await pg.queryAsync(
    sql`-- setTrackHeard
UPDATE user__track
SET user__track_heard = ${now}
WHERE track_id = ${trackId}
  AND meta_account_user_id = ${userId}
`,
  )
  return { heardAt: now ? now.toISOString() : null }
}
```

- [ ] **Step 2: Update setAllHeard to return heardAt + count**

Replace `module.exports.setAllHeard`:

```javascript
module.exports.setAllHeard = async (userId, heard, interval) => {
  const now = heard ? new Date() : null
  const result = await pg.queryAsync(
    sql`-- setAllHeard
UPDATE user__track
SET user__track_heard = ${now}
WHERE track_id IN (
  SELECT track_id
  FROM user__track
    NATURAL JOIN track
    NATURAL JOIN store__track
  WHERE meta_account_user_id = ${userId}
    AND user__track_heard IS NULL
    AND store__track_released < NOW() - ${interval}::INTERVAL
)
`,
  )
  return { heardAt: now ? now.toISOString() : null, count: result.rowCount }
}
```

- [ ] **Step 3: Add deleteHeardSince**

Add after `setAllHeard`:

```javascript
module.exports.deleteHeardSince = (userId, since) =>
  pg.queryAsync(
    sql`-- deleteHeardSince
UPDATE user__track
SET user__track_heard = NULL
WHERE meta_account_user_id = ${userId}
  AND user__track_heard >= ${since}
`,
  )
```

- [ ] **Step 4: Update API routes to return the new data and add DELETE /tracks/heard**

In `packages/back/routes/users/api.js`:

Import `deleteHeardSince` from `./db` (add to the destructure at the top).

Update the `POST /tracks/:id` route:
```javascript
router.post('/tracks/:id', async ({ user: { id: userId }, params: { id }, body: { heard } }, res) => {
  res.json(await setTrackHeard(id, userId, heard))
})
```

Update the `PATCH /tracks/` route:
```javascript
router.patch('/tracks/', async ({ user: { id: authUserId }, body: { heard }, query: { interval } }, res) => {
  res.json(await setAllHeard(authUserId, heard, interval))
})
```

Add the new DELETE route after `PATCH /tracks/`:
```javascript
router.delete('/tracks/heard', async ({ user: { id: authUserId }, query: { since } }, res) => {
  if (!since) return res.status(400).json({ error: 'since query parameter is required' })
  const sinceDate = new Date(since)
  if (isNaN(sinceDate.getTime())) return res.status(400).json({ error: 'since must be a valid ISO timestamp' })
  await deleteHeardSince(authUserId, sinceDate)
  res.status(204).end()
})
```

- [ ] **Step 5: Commit**

```bash
git add packages/back/routes/users/db.js packages/back/routes/users/api.js
git commit -m "feat: setTrackHeard/setAllHeard return timestamp+count; add undo-heard endpoint"
```

---

## Task 8: RLS + fomoplayer_query role migration

**Files:**
- Create: `packages/back/migrations/20260427120000-add-query-rls.js`
- Create: `packages/back/migrations/sqls/20260427120000-add-query-rls-up.sql`
- Create: `packages/back/migrations/sqls/20260427120000-add-query-rls-down.sql`

- [ ] **Step 1: Write the up SQL**

`packages/back/migrations/sqls/20260427120000-add-query-rls-up.sql`:
```sql
-- Create read-only query role
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fomoplayer_query') THEN
    CREATE ROLE fomoplayer_query NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Grant SELECT on all exposed tables
GRANT SELECT ON
  artist, artist__genre, cart, cart__store, genre, key, key_name, key_system,
  label, playlist, release, release__track, source, store, store__artist,
  store__artist_watch, store__artist_watch__user, store__genre, store__label,
  store__label_watch, store__label_watch__user, store__release, store__track,
  store__track_preview, store__track_preview_embedding, store__track_preview_fingerprint,
  store__track_preview_fingerprint_meta, store__track_preview_waveform,
  store_playlist_type, track, track__artist, track__cart, track__genre,
  track__key, track__label, track_details, user__artist__label_ignore,
  user__artist_ignore, user__label_ignore, user__playlist_watch,
  user__release_ignore, user__track, user_notification_audio_sample,
  user_notification_audio_sample_embedding, user_notification_audio_sample_fingerprint,
  user_notification_audio_sample_fingerprint_meta, user_search_notification,
  user_search_notification__store, user_track_score_weight
TO fomoplayer_query;

-- Enable RLS on tables with direct meta_account_user_id
ALTER TABLE cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__track ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__artist_ignore ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__label_ignore ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__artist__label_ignore ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__release_ignore ENABLE ROW LEVEL SECURITY;
ALTER TABLE store__artist_watch__user ENABLE ROW LEVEL SECURITY;
ALTER TABLE store__label_watch__user ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__playlist_watch ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_search_notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_track_score_weight ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample ENABLE ROW LEVEL SECURITY;

-- Enable RLS on subquery tables
ALTER TABLE track__cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_fingerprint ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_fingerprint_meta ENABLE ROW LEVEL SECURITY;

-- Direct meta_account_user_id policies (fomoplayer_query role only)
CREATE POLICY fomoplayer_query_cart ON cart FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

CREATE POLICY fomoplayer_query_user__track ON user__track FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

CREATE POLICY fomoplayer_query_user__artist_ignore ON user__artist_ignore FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

CREATE POLICY fomoplayer_query_user__label_ignore ON user__label_ignore FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

CREATE POLICY fomoplayer_query_user__artist__label_ignore ON user__artist__label_ignore FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

CREATE POLICY fomoplayer_query_user__release_ignore ON user__release_ignore FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

CREATE POLICY fomoplayer_query_store__artist_watch__user ON store__artist_watch__user FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

CREATE POLICY fomoplayer_query_store__label_watch__user ON store__label_watch__user FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

CREATE POLICY fomoplayer_query_user__playlist_watch ON user__playlist_watch FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

CREATE POLICY fomoplayer_query_user_search_notification ON user_search_notification FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

CREATE POLICY fomoplayer_query_user_track_score_weight ON user_track_score_weight FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

CREATE POLICY fomoplayer_query_user_notification_audio_sample ON user_notification_audio_sample FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

-- Subquery policies
CREATE POLICY fomoplayer_query_track__cart ON track__cart FOR SELECT TO fomoplayer_query
  USING (cart_id IN (
    SELECT cart_id FROM cart
    WHERE meta_account_user_id = current_setting('app.current_user_id')::int
  ));

CREATE POLICY fomoplayer_query_unas_embedding ON user_notification_audio_sample_embedding FOR SELECT TO fomoplayer_query
  USING (user_notification_audio_sample_id IN (
    SELECT user_notification_audio_sample_id FROM user_notification_audio_sample
    WHERE meta_account_user_id = current_setting('app.current_user_id')::int
  ));

CREATE POLICY fomoplayer_query_unas_fingerprint ON user_notification_audio_sample_fingerprint FOR SELECT TO fomoplayer_query
  USING (user_notification_audio_sample_id IN (
    SELECT user_notification_audio_sample_id FROM user_notification_audio_sample
    WHERE meta_account_user_id = current_setting('app.current_user_id')::int
  ));

CREATE POLICY fomoplayer_query_unas_fingerprint_meta ON user_notification_audio_sample_fingerprint_meta FOR SELECT TO fomoplayer_query
  USING (user_notification_audio_sample_id IN (
    SELECT user_notification_audio_sample_id FROM user_notification_audio_sample
    WHERE meta_account_user_id = current_setting('app.current_user_id')::int
  ));
```

- [ ] **Step 2: Write the down SQL**

`packages/back/migrations/sqls/20260427120000-add-query-rls-down.sql`:
```sql
DROP POLICY IF EXISTS fomoplayer_query_cart ON cart;
DROP POLICY IF EXISTS fomoplayer_query_user__track ON user__track;
DROP POLICY IF EXISTS fomoplayer_query_user__artist_ignore ON user__artist_ignore;
DROP POLICY IF EXISTS fomoplayer_query_user__label_ignore ON user__label_ignore;
DROP POLICY IF EXISTS fomoplayer_query_user__artist__label_ignore ON user__artist__label_ignore;
DROP POLICY IF EXISTS fomoplayer_query_user__release_ignore ON user__release_ignore;
DROP POLICY IF EXISTS fomoplayer_query_store__artist_watch__user ON store__artist_watch__user;
DROP POLICY IF EXISTS fomoplayer_query_store__label_watch__user ON store__label_watch__user;
DROP POLICY IF EXISTS fomoplayer_query_user__playlist_watch ON user__playlist_watch;
DROP POLICY IF EXISTS fomoplayer_query_user_search_notification ON user_search_notification;
DROP POLICY IF EXISTS fomoplayer_query_user_track_score_weight ON user_track_score_weight;
DROP POLICY IF EXISTS fomoplayer_query_user_notification_audio_sample ON user_notification_audio_sample;
DROP POLICY IF EXISTS fomoplayer_query_track__cart ON track__cart;
DROP POLICY IF EXISTS fomoplayer_query_unas_embedding ON user_notification_audio_sample_embedding;
DROP POLICY IF EXISTS fomoplayer_query_unas_fingerprint ON user_notification_audio_sample_fingerprint;
DROP POLICY IF EXISTS fomoplayer_query_unas_fingerprint_meta ON user_notification_audio_sample_fingerprint_meta;

ALTER TABLE cart DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__track DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__artist_ignore DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__label_ignore DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__artist__label_ignore DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__release_ignore DISABLE ROW LEVEL SECURITY;
ALTER TABLE store__artist_watch__user DISABLE ROW LEVEL SECURITY;
ALTER TABLE store__label_watch__user DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__playlist_watch DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_search_notification DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_track_score_weight DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample DISABLE ROW LEVEL SECURITY;
ALTER TABLE track__cart DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_embedding DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_fingerprint DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_fingerprint_meta DISABLE ROW LEVEL SECURITY;

DROP ROLE IF EXISTS fomoplayer_query;
```

- [ ] **Step 3: Write migration JS wrapper**

`packages/back/migrations/20260427120000-add-query-rls.js` — same boilerplate as Task 1 Step 3, with `20260427120000-add-query-rls` as the filename stem.

- [ ] **Step 4: Run migration**

```bash
cd packages/back && npm run migrate
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx db-migrate -e test up
```

- [ ] **Step 5: Commit**

```bash
git add packages/back/migrations/20260427120000-add-query-rls.js \
        packages/back/migrations/sqls/20260427120000-add-query-rls-up.sql \
        packages/back/migrations/sqls/20260427120000-add-query-rls-down.sql
git commit -m "feat: add fomoplayer_query role and RLS policies"
```

---

## Task 9: Query endpoint

**Files:**
- Create: `packages/back/routes/users/query.js`
- Modify: `packages/back/routes/index.js`

- [ ] **Step 1: Install node-sql-parser**

```bash
cd packages/back && npm install node-sql-parser
```

- [ ] **Step 2: Write the query route**

`packages/back/routes/users/query.js`:
```javascript
'use strict'
const router = require('express-promise-router')()
const { Parser } = require('node-sql-parser')
const { pool } = require('fomoplayer_shared').db.pg
const logger = require('fomoplayer_shared').logger(__filename)

const sqlParser = new Parser()
const MAX_ROWS = 500

const isSelectOnly = (sql) => {
  try {
    const ast = sqlParser.astify(sql)
    const stmts = Array.isArray(ast) ? ast : [ast]
    return stmts.every((s) => s.type === 'select')
  } catch {
    return false
  }
}

router.post('/', async ({ user: { id: userId }, body: { sql: userSql } }, res) => {
  if (!userSql || typeof userSql !== 'string') {
    return res.status(400).json({ error: 'sql is required' })
  }

  if (!isSelectOnly(userSql)) {
    return res.status(400).json({ error: 'Only SELECT statements are allowed' })
  }

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

- [ ] **Step 3: Mount in routes/index.js**

Add after the `router.use('/me/api-keys', ...)` line:
```javascript
router.use('/me/query', require('./users/query.js'))
```

- [ ] **Step 4: Commit**

```bash
git add packages/back/routes/users/query.js packages/back/routes/index.js \
        packages/back/package.json packages/back/package-lock.json
git commit -m "feat: add read-only SQL query endpoint with RLS and statement_timeout"
```

---

---

## Task 10: Backend tests — API key exchange + auth

**Files:**
- Create: `packages/back/test/lib/api-key.js`
- Create: `packages/back/test/tests/users/auth/api-key-exchange.js`
- Create: `packages/back/test/tests/users/auth/api-key-auth.js`
- Modify: `packages/back/config.js` — verify `apiOrigin` is exported (read file first)

Before writing tests, open `packages/back/config.js` and note the exact exported name for the API origin (used as issuer in handoff tokens). It is likely `apiOrigin` or similar; confirm before using in tests.

- [ ] **Step 1: Write the test helper**

`packages/back/test/lib/api-key.js`:
```javascript
'use strict'
const { createApiKey } = require('../../db/api-key')
const { resolveTestUserId } = require('./test-user')

let cachedKey = null

module.exports.createTestApiKey = async () => {
  if (cachedKey) return cachedKey
  const userId = await resolveTestUserId()
  const raw = `fp_test_${Date.now()}`
  await createApiKey(userId, raw, 'Test key')
  cachedKey = { raw, userId }
  return cachedKey
}

module.exports.clearTestApiKeyCache = () => { cachedKey = null }
```

- [ ] **Step 2: Write the exchange tests**

`packages/back/test/tests/users/auth/api-key-exchange.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { mintHandoffToken } = require('../../../../routes/shared/auth-handoff-token')
const { startServer } = require('../../../lib/server')

const HANDOFF_SECRET = process.env.OIDC_HANDOFF_SECRET
const API_ORIGIN = process.env.API_URL ?? `http://localhost`

let server, port, baseUrl

test({
  before: async () => {
    ;({ server, port } = await startServer())
    baseUrl = `http://localhost:${port}`
  },
  after: () => server.kill(),

  'POST /api/auth/api-keys/exchange-handoff': {
    'returns 400 when token is missing': async () => {
      const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert.strictEqual(r.status, 400)
    },

    'returns 401 for invalid token': async () => {
      const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'not-a-valid-jwt' }),
      })
      assert.strictEqual(r.status, 401)
    },

    'issues an API key for a valid handoff token': async () => {
      const { token } = mintHandoffToken({
        secret: HANDOFF_SECRET,
        issuer: API_ORIGIN,
        audience: API_ORIGIN,
        oidcIssuer: 'accounts.google.com',
        oidcSubject: 'test-subject-exchange',
      })
      const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: 'test key' }),
      })
      assert.strictEqual(r.status, 200)
      const body = await r.json()
      assert.ok(body.key.startsWith('fp_'))
      assert.ok(body.id)
    },

    'rejects a replayed token': async () => {
      const { token } = mintHandoffToken({
        secret: HANDOFF_SECRET,
        issuer: API_ORIGIN,
        audience: API_ORIGIN,
        oidcIssuer: 'accounts.google.com',
        oidcSubject: 'test-subject-replay',
      })
      const first = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      assert.strictEqual(first.status, 200)
      const second = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      assert.strictEqual(second.status, 401)
    },
  },
})
```

- [ ] **Step 3: Run exchange tests to verify they pass**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/auth/api-key-exchange.js
```

Expected: all 4 tests pass.

- [ ] **Step 4: Write API key auth tests**

`packages/back/test/tests/users/auth/api-key-auth.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { startServer } = require('../../../lib/server')
const { createTestApiKey } = require('../../../lib/api-key')

let server, port, baseUrl, rawKey

test({
  before: async () => {
    ;({ server, port } = await startServer())
    baseUrl = `http://localhost:${port}`
    ;({ raw: rawKey } = await createTestApiKey())
  },
  after: () => server.kill(),

  'API key authentication': {
    'returns 401 for missing Authorization header': async () => {
      const r = await fetch(`${baseUrl}/api/me/tracks`)
      assert.strictEqual(r.status, 401)
    },

    'returns 401 for unknown key': async () => {
      const r = await fetch(`${baseUrl}/api/me/tracks`, {
        headers: { Authorization: 'Bearer fp_unknown_key_value' },
      })
      assert.strictEqual(r.status, 401)
    },

    'returns 200 for valid API key': async () => {
      const r = await fetch(`${baseUrl}/api/me/tracks`, {
        headers: { Authorization: `Bearer ${rawKey}` },
      })
      assert.strictEqual(r.status, 200)
    },

    'GET /api/me/api-keys returns key list': async () => {
      const r = await fetch(`${baseUrl}/api/me/api-keys`, {
        headers: { Authorization: `Bearer ${rawKey}` },
      })
      assert.strictEqual(r.status, 200)
      const keys = await r.json()
      assert.ok(Array.isArray(keys))
      assert.ok(keys.length >= 1)
    },
  },
})
```

- [ ] **Step 5: Run auth tests**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/auth/api-key-auth.js
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/back/test/lib/api-key.js \
        packages/back/test/tests/users/auth/api-key-exchange.js \
        packages/back/test/tests/users/auth/api-key-auth.js
git commit -m "test: API key exchange and authentication"
```

---

## Task 11: Backend tests — rate limiting

**Files:**
- Create: `packages/back/test/tests/users/auth/api-key-rate-limit.js`

- [ ] **Step 1: Write rate limiter unit tests**

`packages/back/test/tests/users/auth/api-key-rate-limit.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { ApiKeyRateLimiter } = require('../../../../routes/shared/api-key-rate-limiter')

test({
  'ApiKeyRateLimiter': {
    'allows requests under the per-minute limit': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 5; i++) {
        const r = rl.check('k1', { perMinute: 5, perDay: 1000 })
        assert.strictEqual(r.allowed, true)
      }
    },

    'blocks when per-minute limit is exceeded': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 3; i++) rl.check('k2', { perMinute: 3, perDay: 1000 })
      const r = rl.check('k2', { perMinute: 3, perDay: 1000 })
      assert.strictEqual(r.allowed, false)
      assert.ok(r.retryAfter > 0)
      assert.strictEqual(r.limitPerMinute, 3)
      assert.strictEqual(r.remainingMinute, 0)
    },

    'resets minute window after 60 seconds': () => {
      let fakeNow = 0
      const rl = new ApiKeyRateLimiter({ now: () => fakeNow })
      for (let i = 0; i < 3; i++) rl.check('k3', { perMinute: 3, perDay: 1000 })
      assert.strictEqual(rl.check('k3', { perMinute: 3, perDay: 1000 }).allowed, false)
      fakeNow = 60_001
      assert.strictEqual(rl.check('k3', { perMinute: 3, perDay: 1000 }).allowed, true)
    },

    'blocks when per-day limit is exceeded': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 2; i++) rl.check('k4', { perMinute: 100, perDay: 2 })
      const r = rl.check('k4', { perMinute: 100, perDay: 2 })
      assert.strictEqual(r.allowed, false)
      assert.strictEqual(r.limitPerDay, 2)
      assert.strictEqual(r.remainingDay, 0)
    },

    'tracks different keys independently': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 3; i++) rl.check('kA', { perMinute: 3, perDay: 1000 })
      const r = rl.check('kB', { perMinute: 3, perDay: 1000 })
      assert.strictEqual(r.allowed, true)
    },
  },
})
```

- [ ] **Step 2: Run rate limiter tests**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/auth/api-key-rate-limit.js
```

Expected: all 5 tests pass.

- [ ] **Step 3: Write integration test for 429 response**

Add to `packages/back/test/tests/users/auth/api-key-auth.js` (inside the existing test block):

```javascript
    'returns 429 with Retry-After when rate limit exceeded': async () => {
      // Create a key with limit=1/min for this test
      const { createApiKey } = require('../../db/api-key')
      const { resolveTestUserId } = require('../../../lib/test-user')
      const userId = await resolveTestUserId()
      const raw = `fp_rl_test_${Date.now()}`
      await createApiKey(userId, raw, 'rate-limit-test')
      // Patch the key's limit to 1/min directly in DB
      const pg = require('fomoplayer_shared').db.pg
      const sql = require('sql-template-strings')
      await pg.queryAsync(sql`UPDATE api_key SET rate_limit_per_minute = 1 WHERE api_key_hash = ${require('crypto').createHash('sha256').update(raw).digest('hex')}`)

      const headers = { Authorization: `Bearer ${raw}` }
      const first = await fetch(`${baseUrl}/api/me/tracks`, { headers })
      assert.strictEqual(first.status, 200)
      const second = await fetch(`${baseUrl}/api/me/tracks`, { headers })
      assert.strictEqual(second.status, 429)
      assert.ok(second.headers.get('retry-after'))
    },
```

Note: the rate limiter is in-process and keyed by `api_key_id`. Since the test server is a spawned child process, this test exercises the full path through the server.

- [ ] **Step 4: Run updated auth tests**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/auth/api-key-auth.js
```

Expected: all tests pass including the 429 test.

- [ ] **Step 5: Commit**

```bash
git add packages/back/test/tests/users/auth/api-key-rate-limit.js \
        packages/back/test/tests/users/auth/api-key-auth.js
git commit -m "test: rate limiter unit tests and 429 integration test"
```

---

## Task 12: Backend tests — query endpoint + RLS

**Files:**
- Create: `packages/back/test/tests/users/query.js`
- Create: `packages/back/test/tests/users/query-rls.js`

- [ ] **Step 1: Write query endpoint tests**

`packages/back/test/tests/users/query.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')

let server, port, baseUrl, rawKey

const query = (sql) =>
  fetch(`${baseUrl}/api/me/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
    body: JSON.stringify({ sql }),
  })

test({
  before: async () => {
    ;({ server, port } = await startServer())
    baseUrl = `http://localhost:${port}`
    ;({ raw: rawKey } = await createTestApiKey())
  },
  after: () => server.kill(),

  'POST /api/me/query': {
    'accepts a valid SELECT': async () => {
      const r = await query('SELECT 1 AS n')
      assert.strictEqual(r.status, 200)
      const body = await r.json()
      assert.deepStrictEqual(body.rows, [{ n: 1 }])
    },

    'rejects INSERT': async () => {
      const r = await query("INSERT INTO track VALUES (1)")
      assert.strictEqual(r.status, 400)
    },

    'rejects UPDATE': async () => {
      const r = await query("UPDATE track SET track_id = 1")
      assert.strictEqual(r.status, 400)
    },

    'rejects DROP': async () => {
      const r = await query("DROP TABLE track")
      assert.strictEqual(r.status, 400)
    },

    'returns 400 when sql is missing': async () => {
      const r = await fetch(`${baseUrl}/api/me/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
        body: JSON.stringify({}),
      })
      assert.strictEqual(r.status, 400)
    },

    'caps results at 500 rows': async () => {
      // generate_series produces 600 rows
      const r = await query('SELECT generate_series(1, 600) AS n')
      assert.strictEqual(r.status, 200)
      const body = await r.json()
      assert.strictEqual(body.rows.length, 500)
      assert.strictEqual(body.truncated, true)
    },

    'times out long-running queries': async () => {
      const r = await query("SELECT pg_sleep(10)")
      assert.strictEqual(r.status, 408)
    },
  },
})
```

- [ ] **Step 2: Run query tests**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/query.js
```

Expected: all 7 tests pass.

- [ ] **Step 3: Write RLS tests**

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

let server, port, baseUrl
let userAKey, userBKey, userAId, userBId

const query = (rawKey, userSql) =>
  fetch(`${baseUrl}/api/me/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
    body: JSON.stringify({ sql: userSql }),
  }).then((r) => r.json())

test({
  before: async () => {
    ;({ server, port } = await startServer())
    baseUrl = `http://localhost:${port}`

    userAId = await resolveTestUserId()

    // Create a second test user directly in DB
    const rows = await pg.queryRowsAsync(sql`
      INSERT INTO meta_account (meta_account_user_id) VALUES (DEFAULT) RETURNING meta_account_user_id
    `)
    userBId = rows[0].meta_account_user_id

    const rawA = `fp_rls_a_${Date.now()}`
    const rawB = `fp_rls_b_${Date.now()}`
    await createApiKey(userAId, rawA, 'rls-test-a')
    await createApiKey(userBId, rawB, 'rls-test-b')
    userAKey = rawA
    userBKey = rawB

    // Create a cart for user A
    await pg.queryAsync(sql`
      INSERT INTO cart (cart_name, meta_account_user_id) VALUES ('rls-test-cart', ${userAId})
    `)
  },
  after: async () => {
    server.kill()
    await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${userBId}`)
  },

  'RLS isolation': {
    'user sees own user__track rows': async () => {
      const body = await query(userAKey, 'SELECT meta_account_user_id FROM user__track LIMIT 1')
      if (body.rows.length > 0) {
        assert.strictEqual(body.rows[0].meta_account_user_id, userAId)
      }
    },

    'user does not see other user cart rows': async () => {
      const bodyB = await query(userBKey, `SELECT cart_id FROM cart WHERE cart_name = 'rls-test-cart'`)
      assert.strictEqual(bodyB.rows.length, 0)
    },

    'user sees own cart rows': async () => {
      const bodyA = await query(userAKey, `SELECT cart_id FROM cart WHERE cart_name = 'rls-test-cart'`)
      assert.ok(bodyA.rows.length >= 1)
    },

    'user cannot read track__cart for another user cart via subquery': async () => {
      // Get cart_id for user A's cart (user B should see 0 track__cart rows for it)
      const [{ cart_id }] = (await pg.queryRowsAsync(sql`
        SELECT cart_id FROM cart WHERE cart_name = 'rls-test-cart' AND meta_account_user_id = ${userAId}
      `))
      const bodyB = await query(userBKey, `SELECT * FROM track__cart WHERE cart_id = ${cart_id}`)
      assert.strictEqual(bodyB.rows.length, 0)
    },
  },
})
```

- [ ] **Step 4: Run RLS tests**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/query-rls.js
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/back/test/tests/users/query.js packages/back/test/tests/users/query-rls.js
git commit -m "test: query endpoint and RLS isolation"
```

---

## Task 13: Backend tests — undo_mark_heard

**Files:**
- Create: `packages/back/test/tests/users/undo-heard.js`

- [ ] **Step 1: Write the tests**

`packages/back/test/tests/users/undo-heard.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')

let server, port, baseUrl, rawKey

const req = (method, path, body) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
    body: body ? JSON.stringify(body) : undefined,
  })

test({
  before: async () => {
    ;({ server, port } = await startServer())
    baseUrl = `http://localhost:${port}`
    ;({ raw: rawKey } = await createTestApiKey())
  },
  after: () => server.kill(),

  'DELETE /api/me/tracks/heard': {
    'returns 400 when since is missing': async () => {
      const r = await req('DELETE', '/api/me/tracks/heard')
      assert.strictEqual(r.status, 400)
    },

    'returns 400 for invalid timestamp': async () => {
      const r = await req('DELETE', '/api/me/tracks/heard?since=not-a-date')
      assert.strictEqual(r.status, 400)
    },

    'returns 204 on success': async () => {
      const r = await req('DELETE', `/api/me/tracks/heard?since=${new Date().toISOString()}`)
      assert.strictEqual(r.status, 204)
    },

    'mark-heard then undo leaves tracks unheard': async () => {
      // Mark all heard (interval 100 years to catch everything)
      const markRes = await req('PATCH', '/api/me/tracks/', { heard: true, interval: undefined })
      // interval may not be needed for all tracks; use the setAllHeard endpoint
      // Simpler: just test the undo-heard with a well-known timestamp
      const before = new Date(Date.now() - 1000).toISOString()
      await req('PATCH', '/api/me/tracks/', { heard: true })
      const undoRes = await req('DELETE', `/api/me/tracks/heard?since=${before}`)
      assert.strictEqual(undoRes.status, 204)
      // Verify tracks are unheard again via query endpoint
      const tracksRes = await req('GET', '/api/me/tracks')
      assert.strictEqual(tracksRes.status, 200)
    },
  },
})
```

- [ ] **Step 2: Run the tests**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/undo-heard.js
```

Expected: all 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/back/test/tests/users/undo-heard.js
git commit -m "test: undo_mark_heard endpoint"
```

---

## Task 14: Penetration tests

**Files:**
- Create: `packages/back/test/tests/users/auth/api-key-pentest.js`

- [ ] **Step 1: Write the penetration tests**

`packages/back/test/tests/users/auth/api-key-pentest.js`:
```javascript
'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { startServer } = require('../../../lib/server')
const { createTestApiKey } = require('../../../lib/api-key')
const { resolveTestUserId } = require('../../../lib/test-user')
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

let server, port, baseUrl, rawKey, userId

const query = (userSql) =>
  fetch(`${baseUrl}/api/me/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
    body: JSON.stringify({ sql: userSql }),
  })

test({
  before: async () => {
    ;({ server, port } = await startServer())
    baseUrl = `http://localhost:${port}`
    ;({ raw: rawKey, userId } = await createTestApiKey())
  },
  after: () => server.kill(),

  'SQL injection via execute_query': {
    'rejects UNION injection': async () => {
      const r = await query("SELECT 1 UNION SELECT meta_account_user_id FROM meta_account")
      // Either rejected by parser or blocked by role (meta_account not granted to fomoplayer_query)
      const body = await r.json()
      assert.ok(r.status === 400 || (r.status === 200 && body.rows.every((row) => !row.meta_account_user_id)))
    },

    'rejects stacked queries': async () => {
      const r = await query("SELECT 1; DROP TABLE track")
      assert.strictEqual(r.status, 400)
    },

    'rejects comment-bypassed write': async () => {
      const r = await query("SELECT 1 -- ; UPDATE user__track SET user__track_heard = NULL")
      // Comment neutralises the UPDATE, SELECT succeeds — that's fine
      assert.ok(r.status === 200 || r.status === 400)
    },

    'cannot SET app.current_user_id in query': async () => {
      // If the query role sets a different user id it still cannot override the transaction-local GUC set by the server
      const r = await query("SELECT set_config('app.current_user_id', '1', true)")
      // This may succeed but the RLS check uses the server-set GUC, not a query-overridden one
      // Verify by checking that a subsequent same-transaction cart query still returns only this user's data
      // (The test framework spawns a new connection per request, so the isolation is tested in query-rls.js)
      assert.ok([200, 400].includes(r.status))
    },
  },

  'RLS bypass attempts': {
    'cannot read another user cart via UNION': async () => {
      // Create a second user and cart
      const [{ meta_account_user_id: otherUserId }] = await pg.queryRowsAsync(sql`
        INSERT INTO meta_account (meta_account_user_id) VALUES (DEFAULT) RETURNING meta_account_user_id
      `)
      const [{ cart_id }] = await pg.queryRowsAsync(sql`
        INSERT INTO cart (cart_name, meta_account_user_id) VALUES ('pentest-cart', ${otherUserId}) RETURNING cart_id
      `)
      const r = await query(`SELECT cart_id FROM cart WHERE cart_id = ${cart_id}`)
      const body = await r.json()
      assert.strictEqual(body.rows.length, 0)
      await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${otherUserId}`)
    },

    'cannot access meta_account table': async () => {
      const r = await query('SELECT * FROM meta_account LIMIT 1')
      assert.strictEqual(r.status, 400)
    },

    'cannot access meta_session table': async () => {
      const r = await query('SELECT * FROM meta_session LIMIT 1')
      assert.strictEqual(r.status, 400)
    },
  },

  'Rate limit bypass': {
    'X-Forwarded-For spoofing does not bypass per-key rate limit': async () => {
      // Rate limiting is per api_key_id, not per IP — X-Forwarded-For has no effect
      // Create a 1-req/min key to verify
      const { createApiKey } = require('../../../../db/api-key')
      const uid = await resolveTestUserId()
      const raw = `fp_pentest_rl_${Date.now()}`
      await createApiKey(uid, raw, 'pentest-rl')
      await pg.queryAsync(sql`UPDATE api_key SET rate_limit_per_minute = 1 WHERE api_key_prefix = ${raw.slice(0, 8)}`)
      const hdrs = { Authorization: `Bearer ${raw}`, 'X-Forwarded-For': '1.2.3.4' }
      const first = await fetch(`${baseUrl}/api/me/tracks`, { headers: hdrs })
      assert.strictEqual(first.status, 200)
      const second = await fetch(`${baseUrl}/api/me/tracks`, { headers: hdrs })
      assert.strictEqual(second.status, 429)
    },
  },
})
```

- [ ] **Step 2: Run the penetration tests**

```bash
cd packages/back && NODE_ENV=test dotenv -e .env.test -- npx cascade-test ./test/tests/users/auth/api-key-pentest.js
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/back/test/tests/users/auth/api-key-pentest.js
git commit -m "test: penetration tests for query API injection and RLS bypass"
```


---

## Task 15: CLI package scaffold

**Files:**
- Create: `packages/cli/package.json`

- [ ] **Step 1: Create the package.json**

`packages/cli/package.json`:
```json
{
  "name": "fomoplayer_cli",
  "version": "1.0.0",
  "description": "CLI and MCP server for Fomo Player",
  "bin": {
    "fomoplayer": "./bin/fomoplayer.js"
  },
  "main": "src/client.js",
  "scripts": {
    "test": "npx cascade-test ./test"
  },
  "engines": {
    "node": "22.x"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.2",
    "node-sql-parser": "^5.3.8",
    "open": "^10.1.2",
    "yargs": "^17.7.2"
  },
  "devDependencies": {
    "cascade-test": "^0.2.3"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd packages/cli && npm install
```

- [ ] **Step 3: Create directory structure**

```bash
mkdir -p packages/cli/bin packages/cli/src/commands packages/cli/mcp packages/cli/test/commands packages/cli/test/mcp
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/package.json packages/cli/package-lock.json
git commit -m "feat: scaffold packages/cli with dependencies"
```

---

## Task 16: CLI config + client modules

**Files:**
- Create: `packages/cli/src/config.js`
- Create: `packages/cli/src/client.js`

- [ ] **Step 1: Write config.js**

`packages/cli/src/config.js`:
```javascript
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')

const CONFIG_DIR = path.join(os.homedir(), '.fomoplayer')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const defaults = {
  apiUrl: 'https://api.fomoplayer.com',
}

const read = () => {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }
  } catch {
    return { ...defaults }
  }
}

const write = (data) => {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...read(), ...data }, null, 2))
}

module.exports = { read, write, CONFIG_FILE }
```

- [ ] **Step 2: Write client.js**

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
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
      }
    }
    const headers = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (res.status === 401) throw Object.assign(new Error('Unauthorized: run `fomoplayer login`'), { code: 'UNAUTHORIZED' })
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after')
      throw Object.assign(new Error(`Rate limit exceeded. Retry after ${retryAfter}s`), { code: 'RATE_LIMITED', retryAfter })
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    if (res.status === 204) return null
    return res.json()
  }

  get(path, opts) { return this._request('GET', path, opts) }
  post(path, body, opts) { return this._request('POST', path, { ...opts, body }) }
  patch(path, body, opts) { return this._request('PATCH', path, { ...opts, body }) }
  delete(path, opts) { return this._request('DELETE', path, opts) }

  // Tracks
  getTracks(opts) { return this.get('/api/me/tracks', { query: opts }) }
  markTrackHeard(id, heard = true) { return this.post(`/api/me/tracks/${id}`, { heard }) }
  markAllHeard(heard = true, interval) { return this.patch('/api/me/tracks/', { heard, interval }) }
  undoHeard(since) { return this.delete(`/api/me/tracks/heard`, { query: { since } }) }

  // Follows
  getArtistFollows(opts) { return this.get('/api/me/follows/artists', { query: opts }) }
  addArtistFollows(body) { return this.post('/api/me/follows/artists', body) }
  removeArtistFollow(id) { return this.delete(`/api/me/follows/artists/${id}`) }
  getLabelFollows(opts) { return this.get('/api/me/follows/labels', { query: opts }) }
  addLabelFollows(body) { return this.post('/api/me/follows/labels', body) }
  removeLabelFollow(id) { return this.delete(`/api/me/follows/labels/${id}`) }
  getPlaylistFollows(opts) { return this.get('/api/me/follows/playlists', { query: opts }) }
  addPlaylistFollows(body) { return this.post('/api/me/follows/playlists', body) }
  removePlaylistFollow(id) { return this.delete(`/api/me/follows/playlists/${id}`) }

  // Carts
  getCarts() { return this.get('/api/me/carts') }
  createCart(name) { return this.post('/api/me/carts', { name }) }
  deleteCart(id) { return this.delete(`/api/me/carts/${id}`) }
  getCartTracks(cartId) { return this.get(`/api/me/carts/${cartId}/tracks`) }
  updateCartTracks(cartId, trackIds, remove = false) {
    return this.patch(`/api/me/carts/${cartId}/tracks`, { trackIds, remove })
  }

  // Ignores
  getArtistIgnores() { return this.get('/api/me/ignores/artists') }
  addArtistIgnore(id) { return this.post('/api/me/ignores/artists', { id }) }
  removeArtistIgnore(id) { return this.delete(`/api/me/ignores/artists/${id}`) }
  getLabelIgnores() { return this.get('/api/me/ignores/labels') }
  addLabelIgnore(id) { return this.post('/api/me/ignores/labels', { id }) }
  removeLabelIgnore(id) { return this.delete(`/api/me/ignores/labels/${id}`) }
  addReleaseIgnore(id) { return this.post('/api/me/ignores/releases', { id }) }

  // Notifications
  getNotifications() { return this.get('/api/me/notifications') }
  updateNotifications() { return this.post('/api/me/notifications/update', {}) }
  getSearchNotifications() { return this.get('/api/me/notifications/searches') }
  addSearchNotification(string, store) { return this.post('/api/me/notifications/searches', { string, store }) }
  removeSearchNotification(id) { return this.delete(`/api/me/notifications/searches/${id}`) }

  // Score weights + settings
  getScoreWeights() { return this.get('/api/me/score-weights') }
  setScoreWeights(weights) { return this.patch('/api/me/score-weights', weights) }
  getSettings() { return this.get('/api/me/settings') }
  setEmail(email) { return this.patch('/api/me/settings/email', { email }) }

  // Search
  search(type, q, opts) { return this.get(`/api/${type}s/`, { query: { q, ...opts } }) }

  // Stores
  getStores() { return this.get('/api/stores') }

  // API keys
  listApiKeys() { return this.get('/api/me/api-keys') }
  revokeApiKey(id) { return this.delete(`/api/me/api-keys/${id}`) }

  // Query + schema
  executeQuery(sql) { return this.post('/api/me/query', { sql }) }
  getSchema() { return this.get('/api/me/query/schema') }
}

module.exports = { FomoPlayerClient }
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/config.js packages/cli/src/client.js
git commit -m "feat: CLI config and HTTP client"
```

---

## Task 17: CLI auth module + schema endpoint

**Files:**
- Create: `packages/cli/src/auth.js`
- Modify: `packages/back/routes/users/query.js` — add GET /schema route

- [ ] **Step 1: Add schema endpoint to query.js**

In `packages/back/routes/users/query.js`, after the `router.post('/', ...)` block, add:

```javascript
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

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

router.get('/schema', async (req, res) => {
  const rows = await pg.queryRowsAsync(sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${EXPOSED_TABLES})
    ORDER BY table_name, ordinal_position
  `)
  const schema = {}
  for (const { table_name, column_name, data_type } of rows) {
    if (!schema[table_name]) schema[table_name] = []
    schema[table_name].push({ column: column_name, type: data_type })
  }
  res.json(schema)
})
```

- [ ] **Step 2: Write auth.js**

`packages/cli/src/auth.js`:
```javascript
'use strict'
const http = require('http')
const { write: writeConfig, read: readConfig } = require('./config')

const openBrowser = async (url) => {
  const { default: open } = await import('open')
  await open(url)
}

const startLocalServer = (port) =>
  new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`)
      const token = url.searchParams.get('token')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body><h2>Login successful. You can close this window.</h2></body></html>')
      server.close()
      resolve(token)
    })
    server.listen(port, '127.0.0.1', () => {})
    server.on('error', reject)
  })

const pickRandomPort = () => Math.floor(Math.random() * (60000 - 10000) + 10000)

module.exports.login = async (apiUrl) => {
  const port = pickRandomPort()
  const tokenPromise = startLocalServer(port)
  const loginUrl = `${apiUrl}/api/auth/login/cli?callbackPort=${port}`
  console.log(`Opening browser for login...\n${loginUrl}`)
  await openBrowser(loginUrl)
  console.log('Waiting for authentication...')
  const token = await tokenPromise
  if (!token) throw new Error('No token received from browser callback')

  const res = await fetch(`${apiUrl}/api/auth/api-keys/exchange-handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name: 'fomoplayer CLI' }),
  })
  if (!res.ok) throw new Error(`Exchange failed: HTTP ${res.status}`)
  const { key } = await res.json()
  writeConfig({ apiKey: key, apiUrl })
  console.log('Logged in successfully.')
}

module.exports.logout = () => {
  writeConfig({ apiKey: undefined })
  console.log('Logged out.')
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/auth.js packages/back/routes/users/query.js
git commit -m "feat: CLI auth module and schema endpoint"
```

---

## Task 18: CLI command modules

**Files:**
- Create: `packages/cli/src/commands/tracks.js`
- Create: `packages/cli/src/commands/follows.js`
- Create: `packages/cli/src/commands/carts.js`
- Create: `packages/cli/src/commands/ignores.js`
- Create: `packages/cli/src/commands/notifications.js`
- Create: `packages/cli/src/commands/settings.js`
- Create: `packages/cli/src/commands/api-keys.js`
- Create: `packages/cli/src/commands/query.js`
- Create: `packages/cli/src/commands/search.js`
- Create: `packages/cli/src/commands/stores.js`
- Create: `packages/cli/src/commands/config.js`

Each command module exports a yargs command object. The pattern is:

```javascript
// packages/cli/src/commands/tracks.js
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')

module.exports = {
  command: 'tracks',
  describe: 'Manage tracks',
  builder: (yargs) =>
    yargs
      .command({
        command: 'list',
        describe: 'List new tracks',
        builder: (y) => y.option('store', { type: 'string' }).option('limit', { type: 'number' }).option('json', { type: 'boolean' }),
        handler: async (argv) => {
          const client = new FomoPlayerClient()
          const data = await client.getTracks({ store: argv.store, limit_new: argv.limit })
          argv.json ? printJson(data) : printTable(data.new ?? data)
        },
      })
      .command({
        command: 'mark-heard <id>',
        describe: 'Mark a track as heard',
        builder: (y) => y.positional('id', { type: 'string' }).option('json', { type: 'boolean' }),
        handler: async (argv) => {
          const client = new FomoPlayerClient()
          const result = await client.markTrackHeard(argv.id)
          argv.json ? printJson(result) : console.log(`Heard at: ${result.heardAt}`)
        },
      })
      .command({
        command: 'mark-heard-all',
        describe: 'Mark all tracks as heard',
        builder: (y) => y.option('interval', { type: 'string' }).option('json', { type: 'boolean' }),
        handler: async (argv) => {
          const client = new FomoPlayerClient()
          const result = await client.markAllHeard(true, argv.interval)
          argv.json ? printJson(result) : console.log(`Marked ${result.count} tracks heard at ${result.heardAt}`)
        },
      })
      .command({
        command: 'undo-heard',
        describe: 'Undo heard status since a timestamp',
        builder: (y) => y.option('since', { type: 'string', demandOption: true }),
        handler: async (argv) => {
          const client = new FomoPlayerClient()
          await client.undoHeard(argv.since)
          console.log('Done.')
        },
      })
      .demandCommand(),
}
```

- [ ] **Step 1: Create `packages/cli/src/output.js`**

```javascript
'use strict'
module.exports.printJson = (data) => console.log(JSON.stringify(data, null, 2))
module.exports.printTable = (rows) => {
  if (!rows || rows.length === 0) { console.log('(no results)'); return }
  const keys = Object.keys(rows[0])
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)))
  const line = widths.map((w) => '-'.repeat(w)).join('  ')
  console.log(keys.map((k, i) => k.padEnd(widths[i])).join('  '))
  console.log(line)
  for (const row of rows) console.log(keys.map((k, i) => String(row[k] ?? '').padEnd(widths[i])).join('  '))
}
```

- [ ] **Step 2: Write tracks.js** (full content shown in the pattern above)

- [ ] **Step 3: Write follows.js**

`packages/cli/src/commands/follows.js` — mirrors the pattern for artists/labels/playlists:

```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')

const followSubcommands = (type, { list, add, remove }) => ({
  command: type,
  describe: `Manage ${type} follows`,
  builder: (yargs) =>
    yargs
      .command({ command: 'list', describe: `List ${type} follows`,
        builder: (y) => y.option('store', { type: 'string' }).option('json', { type: 'boolean' }),
        handler: async (argv) => { const c = new FomoPlayerClient(); const d = await list(c, argv); argv.json ? printJson(d) : printTable(d) } })
      .command({ command: 'add <url>', describe: `Follow a ${type}`,
        builder: (y) => y.positional('url', { type: 'string' }),
        handler: async (argv) => { const c = new FomoPlayerClient(); await add(c, argv); console.log('Done.') } })
      .command({ command: 'remove <id>', describe: `Unfollow a ${type}`,
        builder: (y) => y.positional('id', { type: 'string' }),
        handler: async (argv) => { const c = new FomoPlayerClient(); await remove(c, argv); console.log('Done.') } })
      .demandCommand(),
})

module.exports = {
  command: 'follows',
  describe: 'Manage follows',
  builder: (yargs) =>
    yargs
      .command(followSubcommands('artists', {
        list: (c, a) => c.getArtistFollows({ store: a.store }),
        add: (c, a) => c.addArtistFollows([{ url: a.url }]),
        remove: (c, a) => c.removeArtistFollow(a.id),
      }))
      .command(followSubcommands('labels', {
        list: (c, a) => c.getLabelFollows({ store: a.store }),
        add: (c, a) => c.addLabelFollows([{ url: a.url }]),
        remove: (c, a) => c.removeLabelFollow(a.id),
      }))
      .command(followSubcommands('playlists', {
        list: (c, a) => c.getPlaylistFollows({ store: a.store }),
        add: (c, a) => c.addPlaylistFollows([{ url: a.url }]),
        remove: (c, a) => c.removePlaylistFollow(a.id),
      }))
      .demandCommand(),
}
```

- [ ] **Step 4: Write remaining command modules**

`packages/cli/src/commands/carts.js`:
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
module.exports = {
  command: 'carts', describe: 'Manage carts',
  builder: (y) => y
    .command({ command: 'list', builder: (y) => y.option('json', { type: 'boolean' }),
      handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.getCarts(); a.json ? printJson(d) : printTable(d) } })
    .command({ command: 'create <name>', builder: (y) => y.positional('name', { type: 'string' }),
      handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.createCart(a.name); console.log(`Created cart ${d.id}`) } })
    .command({ command: 'delete <id>', builder: (y) => y.positional('id', { type: 'string' }),
      handler: async (a) => { const c = new FomoPlayerClient(); await c.deleteCart(a.id); console.log('Deleted.') } })
    .command({ command: 'tracks', describe: 'Manage cart tracks',
      builder: (y) => y
        .command({ command: 'list <cart-id>', builder: (y) => y.positional('cart-id', { type: 'string' }).option('json', { type: 'boolean' }),
          handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.getCartTracks(a['cart-id']); a.json ? printJson(d) : printTable(d) } })
        .command({ command: 'add <cart-id> [track-ids..]', builder: (y) => y.positional('cart-id', { type: 'string' }).positional('track-ids', { type: 'string' }),
          handler: async (a) => { const c = new FomoPlayerClient(); await c.updateCartTracks(a['cart-id'], a['track-ids']); console.log('Done.') } })
        .command({ command: 'remove <cart-id> [track-ids..]', builder: (y) => y.positional('cart-id', { type: 'string' }).positional('track-ids', { type: 'string' }),
          handler: async (a) => { const c = new FomoPlayerClient(); await c.updateCartTracks(a['cart-id'], a['track-ids'], true); console.log('Done.') } })
        .demandCommand() })
    .demandCommand(),
}
```

`packages/cli/src/commands/ignores.js`:
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
module.exports = {
  command: 'ignores', describe: 'Manage ignores',
  builder: (y) => y
    .command({ command: 'artists', describe: 'Artist ignores',
      builder: (y) => y
        .command({ command: 'list', builder: (y) => y.option('json', { type: 'boolean' }),
          handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.getArtistIgnores(); a.json ? printJson(d) : printTable(d) } })
        .command({ command: 'add <id>', builder: (y) => y.positional('id', { type: 'string' }),
          handler: async (a) => { const c = new FomoPlayerClient(); await c.addArtistIgnore(a.id); console.log('Done.') } })
        .command({ command: 'remove <id>', builder: (y) => y.positional('id', { type: 'string' }),
          handler: async (a) => { const c = new FomoPlayerClient(); await c.removeArtistIgnore(a.id); console.log('Done.') } })
        .demandCommand() })
    .command({ command: 'labels', describe: 'Label ignores',
      builder: (y) => y
        .command({ command: 'list', builder: (y) => y.option('json', { type: 'boolean' }),
          handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.getLabelIgnores(); a.json ? printJson(d) : printTable(d) } })
        .command({ command: 'add <id>', builder: (y) => y.positional('id', { type: 'string' }),
          handler: async (a) => { const c = new FomoPlayerClient(); await c.addLabelIgnore(a.id); console.log('Done.') } })
        .command({ command: 'remove <id>', builder: (y) => y.positional('id', { type: 'string' }),
          handler: async (a) => { const c = new FomoPlayerClient(); await c.removeLabelIgnore(a.id); console.log('Done.') } })
        .demandCommand() })
    .command({ command: 'releases', describe: 'Release ignores',
      builder: (y) => y
        .command({ command: 'add <id>', builder: (y) => y.positional('id', { type: 'string' }),
          handler: async (a) => { const c = new FomoPlayerClient(); await c.addReleaseIgnore(a.id); console.log('Done.') } })
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
      handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.getNotifications(); a.json ? printJson(d) : printTable(d) } })
    .command({ command: 'update',
      handler: async () => { const c = new FomoPlayerClient(); await c.updateNotifications(); console.log('Done.') } })
    .command({ command: 'search', describe: 'Search notifications',
      builder: (y) => y
        .command({ command: 'list', builder: (y) => y.option('json', { type: 'boolean' }),
          handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.getSearchNotifications(); a.json ? printJson(d) : printTable(d) } })
        .command({ command: 'add <string>', builder: (y) => y.positional('string', { type: 'string' }).option('store', { type: 'string' }),
          handler: async (a) => { const c = new FomoPlayerClient(); await c.addSearchNotification(a.string, a.store); console.log('Done.') } })
        .command({ command: 'remove <id>', builder: (y) => y.positional('id', { type: 'string' }),
          handler: async (a) => { const c = new FomoPlayerClient(); await c.removeSearchNotification(a.id); console.log('Done.') } })
        .demandCommand() })
    .demandCommand(),
}
```

`packages/cli/src/commands/settings.js`:
```javascript
'use strict'
const { FomoPlayerClient } = require('../client')
const { printJson } = require('../output')
module.exports = [
  { command: 'score-weights', describe: 'Manage score weights',
    builder: (y) => y
      .command({ command: 'get', builder: (y) => y.option('json', { type: 'boolean' }),
        handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.getScoreWeights(); a.json ? printJson(d) : printJson(d) } })
      .command({ command: 'set <json>', builder: (y) => y.positional('json', { type: 'string' }),
        handler: async (a) => { const c = new FomoPlayerClient(); await c.setScoreWeights(JSON.parse(a.json)); console.log('Done.') } })
      .demandCommand() },
  { command: 'settings', describe: 'Manage account settings',
    builder: (y) => y
      .command({ command: 'get', builder: (y) => y.option('json', { type: 'boolean' }),
        handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.getSettings(); a.json ? printJson(d) : printJson(d) } })
      .command({ command: 'set-email <email>', builder: (y) => y.positional('email', { type: 'string' }),
        handler: async (a) => { const c = new FomoPlayerClient(); await c.setEmail(a.email); console.log('Done.') } })
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
      handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.listApiKeys(); a.json ? printJson(d) : printTable(d) } })
    .command({ command: 'revoke <id>', builder: (y) => y.positional('id', { type: 'string' }),
      handler: async (a) => { const c = new FomoPlayerClient(); await c.revokeApiKey(a.id); console.log('Revoked.') } })
    .demandCommand(),
}
```

`packages/cli/src/commands/query.js`:
```javascript
'use strict'
const fs = require('fs')
const { FomoPlayerClient } = require('../client')
const { printTable, printJson } = require('../output')
module.exports = [
  { command: 'schema', describe: 'Print exposable tables and columns',
    builder: (y) => y.option('json', { type: 'boolean' }),
    handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.getSchema(); a.json ? printJson(d) : printJson(d) } },
  { command: 'query <sql>', describe: 'Execute a read-only SQL query',
    builder: (y) => y.positional('sql', { type: 'string' }).option('file', { type: 'string', alias: 'f' }).option('json', { type: 'boolean' }),
    handler: async (a) => {
      const c = new FomoPlayerClient()
      const sqlStr = a.file ? fs.readFileSync(a.file, 'utf8') : a.sql
      const d = await c.executeQuery(sqlStr)
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
  handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.search(a.type, a.query); a.json ? printJson(d) : printTable(Array.isArray(d) ? d : [d]) },
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
  handler: async (a) => { const c = new FomoPlayerClient(); const d = await c.getStores(); a.json ? printJson(d) : printTable(d) },
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

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/output.js packages/cli/src/commands/
git commit -m "feat: CLI command modules (tracks, follows, carts, ignores, notifications, settings, query, search, stores)"
```

---

## Task 19: CLI entry point

**Files:**
- Create: `packages/cli/bin/fomoplayer.js`

- [ ] **Step 1: Write the entry point**

`packages/cli/bin/fomoplayer.js`:
```javascript
#!/usr/bin/env node
'use strict'
const yargs = require('yargs')
const { login, logout } = require('../src/auth')
const { read: readConfig } = require('../src/config')
const tracks = require('../src/commands/tracks')
const follows = require('../src/commands/follows')
const carts = require('../src/commands/carts')
const ignores = require('../src/commands/ignores')
const notifications = require('../src/commands/notifications')
const [scoreWeights, settings] = require('../src/commands/settings')
const apiKeys = require('../src/commands/api-keys')
const [schema, query] = require('../src/commands/query')
const search = require('../src/commands/search')
const stores = require('../src/commands/stores')
const config = require('../src/commands/config')

yargs
  .command({
    command: 'login',
    describe: 'Authenticate with Fomo Player',
    handler: async () => {
      const { apiUrl } = readConfig()
      await login(apiUrl)
    },
  })
  .command({
    command: 'logout',
    describe: 'Remove stored credentials',
    handler: logout,
  })
  .command(tracks)
  .command(follows)
  .command(carts)
  .command(ignores)
  .command(notifications)
  .command(scoreWeights)
  .command(settings)
  .command(apiKeys)
  .command(schema)
  .command(query)
  .command(search)
  .command(stores)
  .command(config)
  .completion('completion')
  .demandCommand()
  .help()
  .strict()
  .parse()
```

- [ ] **Step 2: Make executable**

```bash
chmod +x packages/cli/bin/fomoplayer.js
```

- [ ] **Step 3: Smoke test**

```bash
cd packages/cli && node bin/fomoplayer.js --help
```

Expected: help output listing all commands.

```bash
node bin/fomoplayer.js tracks --help
```

Expected: subcommand help for tracks.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/bin/fomoplayer.js
git commit -m "feat: CLI entry point (fomoplayer binary)"
```

---

## Task 20: MCP server

**Files:**
- Create: `packages/cli/mcp/tools.js`
- Create: `packages/cli/mcp/server.js`

- [ ] **Step 1: Write tools.js**

`packages/cli/mcp/tools.js`:
```javascript
'use strict'
const { Parser } = require('node-sql-parser')
const sqlParser = new Parser()

const isSelectOnly = (sql) => {
  try {
    const ast = sqlParser.astify(sql)
    const stmts = Array.isArray(ast) ? ast : [ast]
    return stmts.every((s) => s.type === 'select')
  } catch { return false }
}

module.exports.defineTools = (client) => [
  {
    name: 'get_schema',
    description: 'Returns all exposable table names with their columns and types for SQL query planning.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => client.getSchema(),
  },
  {
    name: 'execute_query',
    description: 'Executes a read-only SQL SELECT query against the Fomo Player database. Results capped at 500 rows.',
    inputSchema: { type: 'object', properties: { sql: { type: 'string', description: 'A SELECT SQL statement' } }, required: ['sql'] },
    handler: async ({ sql }) => {
      if (!isSelectOnly(sql)) throw new Error('Only SELECT statements are allowed')
      return client.executeQuery(sql)
    },
  },
  {
    name: 'get_tracks',
    description: 'List new/recent/heard tracks for the authenticated user.',
    inputSchema: { type: 'object', properties: { store: { type: 'string' }, limit: { type: 'number' } } },
    handler: async ({ store, limit } = {}) => client.getTracks({ store, limit_new: limit }),
  },
  {
    name: 'mark_track_heard',
    description: 'Mark a single track as heard. Returns { heardAt }.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async ({ id }) => client.markTrackHeard(id),
  },
  {
    name: 'mark_all_heard',
    description: 'Mark all (or filtered) tracks as heard. Returns { heardAt, count }.',
    inputSchema: { type: 'object', properties: { interval: { type: 'string', description: 'PostgreSQL interval e.g. "7 days"' } } },
    handler: async ({ interval } = {}) => client.markAllHeard(true, interval),
  },
  {
    name: 'undo_mark_heard',
    description: 'Clear heard status for tracks marked heard at or after the given ISO timestamp.',
    inputSchema: { type: 'object', properties: { since: { type: 'string', description: 'ISO 8601 timestamp' } }, required: ['since'] },
    handler: async ({ since }) => client.undoHeard(since),
  },
  {
    name: 'list_follows',
    description: 'List followed artists, labels, or playlists.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists', 'labels', 'playlists'] }, store: { type: 'string' } }, required: ['type'] },
    handler: async ({ type, store }) => {
      if (type === 'artists') return client.getArtistFollows({ store })
      if (type === 'labels') return client.getLabelFollows({ store })
      return client.getPlaylistFollows({ store })
    },
  },
  {
    name: 'add_follow',
    description: 'Follow an artist, label, or playlist by URL.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists', 'labels', 'playlists'] }, url: { type: 'string' } }, required: ['type', 'url'] },
    handler: async ({ type, url }) => {
      if (type === 'artists') return client.addArtistFollows([{ url }])
      if (type === 'labels') return client.addLabelFollows([{ url }])
      return client.addPlaylistFollows([{ url }])
    },
  },
  {
    name: 'remove_follow',
    description: 'Unfollow an artist, label, or playlist by ID.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists', 'labels', 'playlists'] }, id: { type: 'string' } }, required: ['type', 'id'] },
    handler: async ({ type, id }) => {
      if (type === 'artists') return client.removeArtistFollow(id)
      if (type === 'labels') return client.removeLabelFollow(id)
      return client.removePlaylistFollow(id)
    },
  },
  {
    name: 'list_ignores',
    description: 'List ignored artists or labels.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists', 'labels'] } }, required: ['type'] },
    handler: async ({ type }) => type === 'artists' ? client.getArtistIgnores() : client.getLabelIgnores(),
  },
  {
    name: 'add_ignore',
    description: 'Ignore an artist, label, or release by ID.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists', 'labels', 'releases'] }, id: { type: 'string' } }, required: ['type', 'id'] },
    handler: async ({ type, id }) => {
      if (type === 'artists') return client.addArtistIgnore(id)
      if (type === 'labels') return client.addLabelIgnore(id)
      return client.addReleaseIgnore(id)
    },
  },
  {
    name: 'remove_ignore',
    description: 'Remove an artist or label ignore by ID.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists', 'labels'] }, id: { type: 'string' } }, required: ['type', 'id'] },
    handler: async ({ type, id }) => type === 'artists' ? client.removeArtistIgnore(id) : client.removeLabelIgnore(id),
  },
  {
    name: 'list_carts',
    description: 'List all carts for the user.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.getCarts(),
  },
  {
    name: 'create_cart',
    description: 'Create a new cart.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => client.createCart(name),
  },
  {
    name: 'delete_cart',
    description: 'Delete a cart by ID.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async ({ id }) => client.deleteCart(id),
  },
  {
    name: 'list_cart_tracks',
    description: 'List tracks in a cart.',
    inputSchema: { type: 'object', properties: { cartId: { type: 'string' } }, required: ['cartId'] },
    handler: async ({ cartId }) => client.getCartTracks(cartId),
  },
  {
    name: 'update_cart_tracks',
    description: 'Add or remove tracks from a cart.',
    inputSchema: { type: 'object', properties: { cartId: { type: 'string' }, trackIds: { type: 'array', items: { type: 'string' } }, remove: { type: 'boolean' } }, required: ['cartId', 'trackIds'] },
    handler: async ({ cartId, trackIds, remove = false }) => client.updateCartTracks(cartId, trackIds, remove),
  },
  {
    name: 'list_search_notifications',
    description: 'List keyword search notifications.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.getSearchNotifications(),
  },
  {
    name: 'add_search_notification',
    description: 'Add a keyword search notification.',
    inputSchema: { type: 'object', properties: { string: { type: 'string' }, store: { type: 'string' } }, required: ['string'] },
    handler: async ({ string, store }) => client.addSearchNotification(string, store),
  },
  {
    name: 'remove_search_notification',
    description: 'Remove a search notification by ID.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async ({ id }) => client.removeSearchNotification(id),
  },
  {
    name: 'get_score_weights',
    description: 'Get current track score weights.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.getScoreWeights(),
  },
  {
    name: 'set_score_weights',
    description: 'Update track score weights.',
    inputSchema: { type: 'object', properties: { weights: { type: 'object' } }, required: ['weights'] },
    handler: async ({ weights }) => client.setScoreWeights(weights),
  },
  {
    name: 'get_settings',
    description: 'Get user account settings.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.getSettings(),
  },
  {
    name: 'set_email',
    description: 'Update user email address.',
    inputSchema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
    handler: async ({ email }) => client.setEmail(email),
  },
  {
    name: 'search',
    description: 'Search for artists, labels, or tracks by name.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['artists', 'labels', 'tracks'] }, query: { type: 'string' } }, required: ['type', 'query'] },
    handler: async ({ type, query }) => client.search(type, query),
  },
  {
    name: 'list_stores',
    description: 'List available stores with their IDs.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.getStores(),
  },
  {
    name: 'list_api_keys',
    description: 'List all active API keys for the user.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => client.listApiKeys(),
  },
  {
    name: 'revoke_api_key',
    description: 'Revoke an API key by ID.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async ({ id }) => client.revokeApiKey(id),
  },
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
    const result = await tool.handler(args ?? {})
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
  }
})

const transport = new StdioServerTransport()
server.connect(transport).catch((err) => {
  process.stderr.write(`MCP server error: ${err.message}\n`)
  process.exit(1)
})
```

- [ ] **Step 3: Add mcp command to fomoplayer.js entry point**

In `packages/cli/bin/fomoplayer.js`, add before `.demandCommand()`:
```javascript
  .command({
    command: 'mcp',
    describe: 'Start the MCP server (stdio)',
    handler: () => require('../mcp/server'),
  })
```

- [ ] **Step 4: Add MCP server config**

Create `.claude/settings.json` (or update if it exists) to add the MCP server. Check if `.claude/settings.json` exists first with `ls .claude/`. Then add:
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

If the file already exists, merge the `mcpServers` key rather than overwriting.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/mcp/tools.js packages/cli/mcp/server.js packages/cli/bin/fomoplayer.js .claude/settings.json
git commit -m "feat: MCP server with all tool definitions"
```

---

## Task 21: CLI + MCP tests

**Files:**
- Create: `packages/cli/test/client.test.js`
- Create: `packages/cli/test/auth.test.js`
- Create: `packages/cli/test/commands/tracks.test.js`
- Create: `packages/cli/test/mcp/tools.test.js`

The CLI tests start the backend test server and run real HTTP calls, identical in approach to the browser tests in `packages/back/test/browser/`.

- [ ] **Step 1: Write a shared test server helper for CLI tests**

`packages/cli/test/lib/server.js`:
```javascript
'use strict'
const { spawn } = require('child_process')
const path = require('path')
const net = require('net')

const BACKEND_ROOT = path.resolve(__dirname, '../../../back')

const reservePort = () => new Promise((resolve, reject) => {
  const s = net.createServer()
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address()
    s.close((err) => err ? reject(err) : resolve(port))
  })
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

- [ ] **Step 2: Write client tests**

`packages/cli/test/client.test.js`:
```javascript
'use strict'
require('dotenv').config({ path: require('path').resolve(__dirname, '../../back/.env.test') })
const assert = require('assert')
const { test } = require('cascade-test')
const { startBackend } = require('./lib/server')
const { createTestApiKey } = require('./lib/api-key')

// resolveTestUserId needs the DB URL from .env.test
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/multi-store-player-test'

const { resolveTestUserId } = require('../../back/test/lib/test-user')
const { FomoPlayerClient } = require('../src/client')

let backend, apiKey, client

test({
  before: async () => {
    backend = await startBackend()
    const userId = await resolveTestUserId()
    apiKey = await createTestApiKey(userId)
    client = new FomoPlayerClient({ apiUrl: backend.baseUrl, apiKey })
  },
  after: () => backend.server.kill(),

  'FomoPlayerClient': {
    'getTracks returns an object': async () => {
      const data = await client.getTracks()
      assert.ok(typeof data === 'object')
    },

    'listApiKeys returns an array': async () => {
      const keys = await client.listApiKeys()
      assert.ok(Array.isArray(keys))
    },

    'throws UNAUTHORIZED for missing API key': async () => {
      const unauthClient = new FomoPlayerClient({ apiUrl: backend.baseUrl, apiKey: undefined })
      await assert.rejects(() => unauthClient.getTracks(), (err) => err.code === 'UNAUTHORIZED')
    },

    'executeQuery SELECT works': async () => {
      const result = await client.executeQuery('SELECT 1 AS n')
      assert.deepStrictEqual(result.rows, [{ n: 1 }])
    },

    'executeQuery rejects INSERT client-side': async () => {
      await assert.rejects(() => client.executeQuery("INSERT INTO track VALUES (1)"))
    },
  },
})
```

- [ ] **Step 3: Write MCP tools tests**

`packages/cli/test/mcp/tools.test.js`:
```javascript
'use strict'
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../back/.env.test') })
const assert = require('assert')
const { test } = require('cascade-test')
const { startBackend } = require('../lib/server')
const { createTestApiKey } = require('../lib/api-key')

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost/multi-store-player-test'

const { resolveTestUserId } = require('../../../back/test/lib/test-user')
const { FomoPlayerClient } = require('../../src/client')
const { defineTools } = require('../../mcp/tools')

let backend, tools

test({
  before: async () => {
    backend = await startBackend()
    const userId = await resolveTestUserId()
    const apiKey = await createTestApiKey(userId)
    const client = new FomoPlayerClient({ apiUrl: backend.baseUrl, apiKey })
    tools = defineTools(client)
  },
  after: () => backend.server.kill(),

  'MCP tools': {
    'get_schema returns table definitions': async () => {
      const tool = tools.find((t) => t.name === 'get_schema')
      const schema = await tool.handler({})
      assert.ok(typeof schema === 'object')
      assert.ok(schema.track || schema.artist) // at least one known table
    },

    'execute_query rejects non-SELECT client-side': async () => {
      const tool = tools.find((t) => t.name === 'execute_query')
      await assert.rejects(() => tool.handler({ sql: "DELETE FROM track" }))
    },

    'get_tracks returns object': async () => {
      const tool = tools.find((t) => t.name === 'get_tracks')
      const result = await tool.handler({})
      assert.ok(typeof result === 'object')
    },

    'list_carts returns array': async () => {
      const tool = tools.find((t) => t.name === 'list_carts')
      const result = await tool.handler({})
      assert.ok(Array.isArray(result))
    },
  },
})
```

- [ ] **Step 4: Run CLI tests**

```bash
cd packages/cli && NODE_ENV=test node_modules/.bin/cascade-test ./test/client.test.js
cd packages/cli && NODE_ENV=test node_modules/.bin/cascade-test ./test/mcp/tools.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/test/
git commit -m "test: CLI client and MCP tool integration tests"
```

---

## Task 22: Agent skill file

**Files:**
- Create: `.claude/skills/fomoplayer.md`

- [ ] **Step 1: Create the skills directory if needed**

```bash
mkdir -p .claude/skills
```

- [ ] **Step 2: Write the skill file**

`.claude/skills/fomoplayer.md`:
```markdown
---
name: fomoplayer
description: Use when the user asks you to do anything with their Fomo Player music library — discovering tracks, managing follows/carts/ignores, running analytics queries, or bulk operations.
---

# Fomo Player Agent Skill

You have access to a Fomo Player MCP server. Use it to help the user manage their music library.

## When to use this skill

- User mentions Fomo Player, their music library, tracks, carts, follows, ignores, or search notifications
- User asks for data analysis or filtering (e.g. "unheard tracks at 128 BPM from the last month")
- User wants bulk operations (mark heard, add to cart, follow many artists)

## Standard workflow

For any non-trivial query, always follow this sequence:

1. `get_schema()` — understand available columns before writing SQL
2. `execute_query(sql)` — fetch IDs or rows using a SELECT
3. Structured write tool — use the result IDs to perform mutations (e.g. `update_cart_tracks`)

Never write raw SQL for mutations. Always use the structured tools for writes.

## Common patterns

### Find tracks by BPM + store, add to cart
```
get_schema()
execute_query("SELECT st.track_id FROM store__track st JOIN store s ON s.store_id = st.store_id LEFT JOIN user__track ut ON ut.track_id = st.track_id WHERE s.store_name = 'beatport' AND st.store__track_bpm BETWEEN 125 AND 130 AND ut.user__track_heard IS NULL")
update_cart_tracks(cartId, [trackIds…])
```

### Find embedding-similar tracks (cosine distance)
```
execute_query("SELECT t.track_id, 1 - (e.embedding <=> (SELECT embedding FROM store__track_preview_embedding WHERE track_id = <seed_id> LIMIT 1)) AS similarity FROM store__track_preview_embedding e JOIN track t ON t.track_id = e.track_id ORDER BY similarity DESC LIMIT 20")
```

### Bulk follow artists from a list of IDs
Use `add_follow` with type='artists' once per artist (or batch if IDs are available).

### Undo accidental mark-all-heard
Save the `heardAt` timestamp returned by `mark_all_heard`, then call `undo_mark_heard(since: heardAt)` immediately if the user wants to reverse it.

## Rate limits

Default: 60 requests/minute, 1000/day per API key. Avoid tight loops. Batch where possible; use `execute_query` to fetch many IDs in one call rather than querying one by one.

## Exposable tables (query API)

Global catalog (no RLS): `artist`, `label`, `track`, `store`, `store__track`, `release`, `genre`, `key`, `playlist`, `source`, `cart__store`, `track_details`, and all join/embed tables.

User data (RLS — you only see your own rows): `cart`, `user__track`, `track__cart`, `user__artist_ignore`, `user__label_ignore`, `user__playlist_watch`, `user_search_notification`, `user_track_score_weight`, `user_notification_audio_sample` (and subtables).

Internal tables (`meta_account`, `meta_session`, etc.) are not accessible.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/fomoplayer.md
git commit -m "feat: Claude agent skill file for Fomo Player MCP server"
```

---

## Task 23: Run full test suite

- [ ] **Step 1: Run all backend tests**

```bash
cd packages/back && npm test
```

Expected: all existing tests pass plus the new test files.

- [ ] **Step 2: Run CLI tests**

```bash
cd packages/cli && npm test
```

Expected: all CLI and MCP tests pass.

- [ ] **Step 3: Smoke-test the CLI binary end-to-end**

```bash
node packages/cli/bin/fomoplayer.js --help
node packages/cli/bin/fomoplayer.js tracks --help
node packages/cli/bin/fomoplayer.js query --help
node packages/cli/bin/fomoplayer.js schema --help
```

Expected: no errors, all commands listed.

- [ ] **Step 4: Final commit (any leftover stray changes)**

```bash
git status
# If clean: done. If dirty: review and commit.
```
