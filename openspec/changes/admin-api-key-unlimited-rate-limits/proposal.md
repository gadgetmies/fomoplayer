## Why

API keys are minted with hardcoded default rate limits of 60 requests/minute
and 1000 requests/day. The analyser authenticates to `/api/admin/*` with an
`fp_` API key, and its runs exceed these defaults, tripping `429` rate
limiting. Admin-owned keys need much larger limits so analyser runs complete
without hitting the cap.

## What Changes

- When an API key is minted for an **admin** account (an account whose OIDC
  subject appears in `ADMIN_USER_SUBS`), store effectively-unlimited rate
  limits (`1_000_000_000`/minute and `1_000_000_000`/day) on the key row
  instead of the 60/1000 defaults.
- Apply this to **both** mint routes: `/cli-token` (analyser/CLI path) and
  `/api-keys/exchange-handoff` (in-app path).
- `db/api-key.js` `createApiKey` gains an optional `limits` parameter; when
  omitted, existing callers keep the default 60/1000 behaviour.
- Add an `isAdminUserId(userId)` helper in `routes/shared/auth.js` that reuses
  the existing `ADMIN_USER_SUBS` rule but resolves admin status from a user id
  (the mint paths have no Express `req` to feed `isAdmin`).
- No database migration and no rate-limiter change: "unlimited" is a large
  integer stored in the existing `INTEGER` columns, so the sliding-window
  check simply never trips for these keys.

## Capabilities

### New Capabilities
- `api-key-rate-limiting`: rate limits assigned to API keys at mint time,
  including the admin-account exception that grants effectively-unlimited
  limits.

### Modified Capabilities
<!-- None: no existing spec defines API-key minting rate-limit behaviour. -->

## Impact

- **Code**: `packages/back/db/api-key.js` (`createApiKey` signature + admin
  limits constant), `packages/back/routes/shared/auth.js` (new
  `isAdminUserId` helper), `packages/back/routes/auth.js` (both mint routes).
- **Behaviour**: admin-owned keys minted after this change bypass rate
  limiting in practice; non-admin keys and all other `createApiKey` callers
  are unchanged.
- **No schema change**, no migration, no change to
  `routes/shared/api-key-rate-limiter.js`.
- **Limitation**: limits are frozen at mint time — changing an account's admin
  status does not retroactively alter previously minted keys.
