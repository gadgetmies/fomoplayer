## Context

API keys are stored in the `api_key` table with `rate_limit_per_minute` and
`rate_limit_per_day` `INTEGER NOT NULL` columns defaulting to 60 and 1000.
`db/api-key.js` `createApiKey(userId, rawKey, name)` inserts a row without
specifying those columns, so the defaults apply. `routes/shared/api-key-rate-limiter.js`
enforces the stored limits via an in-process sliding window.

Admin status is not stored as a flag. `routes/shared/auth.js` `isAdmin(req)`
checks whether any OIDC subject on `req.user` (`oidcSubjects` plus the current
login identity) appears in the `ADMIN_USER_SUBS` env list.

The analyser authenticates to `/api/admin/*` with an `fp_` key and exceeds the
60/1000 defaults, hitting `429`.

## Goals / Non-Goals

**Goals:**
- Admin-owned keys are minted with effectively-unlimited rate limits.
- Apply to both mint routes (`/cli-token`, `/api-keys/exchange-handoff`).
- Zero behaviour change for non-admin keys and all other `createApiKey`
  callers.
- No database migration and no change to the rate limiter.

**Non-Goals:**
- Request-time/dynamic limit computation.
- Making the limits configurable via environment variables.
- Backfilling or re-minting existing keys.
- Covering the preview-only Actions-bot admin grant at mint time.

## Decisions

**Represent "unlimited" as a large integer baked at mint time.**
Store `1_000_000_000` for both per-minute and per-day on admin keys. This is
well under the Postgres `INTEGER` maximum (2,147,483,647), so the existing
columns and rate limiter are untouched — the sliding-window check simply never
trips. *Alternatives considered:* a nullable sentinel meaning "no limit"
(rejected — requires a migration and a rate-limiter change); request-time
computation (rejected — moves logic out of minting and was not the chosen
approach).

**Add an optional `limits` parameter to `createApiKey`.**
`createApiKey(userId, rawKey, name, limits)` includes the limit columns in the
`INSERT` only when `limits` is provided; otherwise the columns are omitted and
the table defaults apply. Export a shared `ADMIN_API_KEY_RATE_LIMITS` constant
from `db/api-key.js` so both routes use one definition. *Alternative:* a
separate `createAdminApiKey` function (rejected — duplicates the insert and
diverges over time).

**Resolve admin status from a user id via a new helper.**
`isAdmin(req)` needs an Express `req`; the mint paths have only a user id (and,
on the handoff path, an OIDC subject). Add `isAdminUserId(userId)` in
`routes/shared/auth.js` that loads `oidcSubjects` via `account.findByUserId`
and checks them against the existing module-level `adminUserSubs` list. This
keeps a single source of truth for the admin-subject rule. Both routes call it
and pass `ADMIN_API_KEY_RATE_LIMITS` when it returns true.

## Risks / Trade-offs

- **Limits are frozen at mint time** → Accepted per design choice. Removing an
  account from `ADMIN_USER_SUBS` does not shrink its existing keys' limits, and
  adding an account does not grow them, until a new key is minted. Operators
  re-mint to change effective limits.
- **Extra DB lookup per mint** (`account.findByUserId`) → Negligible; minting
  is rare and already does several queries.
- **Actions-bot admin path not honoured at mint** → Accepted; it is
  session-based and not derivable from a user id, and the bot does not mint
  analyser keys.
- **A truly pathological client could send up to 1e9 requests/min before
  limiting** → Not a practical concern for trusted admin keys; the value is a
  safety ceiling rather than an enforced quota.
