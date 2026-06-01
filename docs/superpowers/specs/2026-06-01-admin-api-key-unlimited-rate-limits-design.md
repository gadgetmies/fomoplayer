# Admin-owned API keys get unlimited rate limits at mint time

**Date:** 2026-06-01
**Status:** Approved

## Problem

API keys are minted with hardcoded default rate limits of 60 requests/minute
and 1000 requests/day (`api_key` table column defaults, applied by
`db/api-key.js` `createApiKey`). The analyser authenticates to `/api/admin/*`
with an `fp_` API key (see the `analyser-cli-api-key-auth` change) and its
runs exceed these defaults, tripping `429` rate limiting. Admin-owned keys
need much larger limits so analyser runs don't hit the cap.

## Goal

When an API key is minted for an account that qualifies as **admin**, store
effectively-unlimited rate limits on the key row instead of the 60/1000
defaults. Non-admin key minting is unchanged.

"Admin" uses the existing, documented mechanism: an account whose OIDC subject
appears in the `ADMIN_USER_SUBS` environment variable. This is the same rule
`routes/shared/auth.js` `isAdmin(req)` enforces at request time.

## Decisions (from brainstorming)

- **Effectively unlimited**, not a large finite cap and not env-configurable.
- **Bake at mint time**: the decision is made when the key is created and the
  resulting limits are stored on the key row. (Accepted trade-off: limits are
  frozen at mint — see Limitations.)
- **Both mint routes** apply the admin treatment: `/cli-token` (analyser/CLI
  path) and `/api-keys/exchange-handoff` (in-app path).

## Design

### 1. `db/api-key.js` — `createApiKey` accepts optional limits

Add an optional `limits` parameter:

```js
const ADMIN_API_KEY_RATE_LIMITS = { ratePerMinute: 1_000_000_000, ratePerDay: 1_000_000_000 }

createApiKey(userId, rawKey, name, limits)  // limits optional
```

- When `limits` is provided, the `INSERT` explicitly sets
  `rate_limit_per_minute` and `rate_limit_per_day`.
- When `limits` is omitted, the columns are left out of the `INSERT` so the
  existing table defaults (60 / 1000) apply. This preserves current behaviour
  for every other caller.

"Unlimited" is represented as a large integer (`1_000_000_000`), well under
the Postgres `INTEGER` maximum (2,147,483,647). Because the value is so large,
the sliding-window check in `routes/shared/api-key-rate-limiter.js` never
trips for these keys.

**No schema migration** (columns and types are unchanged) and **no
rate-limiter change** (it keeps comparing usage against the stored integer).

`ADMIN_API_KEY_RATE_LIMITS` is exported from `db/api-key.js` so the mint
routes share one definition of "unlimited".

### 2. `routes/shared/auth.js` — new `isAdminUserId(userId)` helper

The existing `isAdmin(req)` requires an Express `req` with a populated
`req.user`. At mint time we only have a user id (and, on one path, an OIDC
subject). Add a sibling helper that works from a user id:

```js
const isAdminUserId = async (userId) => {
  const { oidcSubjects } = await account.findByUserId(userId)
  return (oidcSubjects ?? []).some((sub) => adminUserSubs.includes(sub))
}
```

It reuses the module-level `adminUserSubs` list already parsed in this file,
keeping a single source of truth for the admin-subject rule.
`account.findByUserId` already returns the aggregated `oidcSubjects` array.

### 3. Both mint routes determine admin and pass limits

In `routes/auth.js`:

- **`/cli-token`** (currently `await createApiKey(result.userId, rawKey, 'CLI')`):
  compute `const limits = (await isAdminUserId(result.userId)) ? ADMIN_API_KEY_RATE_LIMITS : undefined`
  and pass it to `createApiKey`.
- **`/api-keys/exchange-handoff`** (currently
  `await createApiKey(user.id, rawKey, name)`): same check on `user.id`.

## Limitations (intentional)

- **Limits are frozen at mint.** If an account is later added to or removed
  from `ADMIN_USER_SUBS`, its existing keys keep whatever limits they were
  minted with until a new key is minted. This follows the chosen "bake at mint
  time" approach.
- **Actions-bot admin path not covered.** The preview-only GitHub Actions bot
  admin grant is session-based (`req.session.isActionsAdmin`) and cannot be
  derived from a user id, so it is not honoured at mint time. Only the
  subject-based admin mechanism is. The actions bot does not mint analyser
  keys, so this has no practical impact.

## Testing

Backend tests under `packages/back/test/tests/admin/` (following existing
patterns):

- With `ADMIN_USER_SUBS` set to a subject owned by the minting account, mint a
  key and assert the stored row has `rate_limit_per_minute` and
  `rate_limit_per_day` equal to the unlimited values.
- Mint a key for an account whose subject is **not** in `ADMIN_USER_SUBS` and
  assert the stored row has the default 60 / 1000 limits.

## Out of scope

- Changing the rate-limiter implementation or storage model.
- Request-time/dynamic limit computation.
- Making limits configurable via environment variables.
- Backfilling or re-minting existing keys.
