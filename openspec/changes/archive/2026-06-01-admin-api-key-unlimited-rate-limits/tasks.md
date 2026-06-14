## 1. Mint-time limits in the data layer

- [x] 1.1 In `packages/back/db/api-key.js`, add and export an `ADMIN_API_KEY_RATE_LIMITS` constant `{ ratePerMinute: 1_000_000_000, ratePerDay: 1_000_000_000 }`
- [x] 1.2 Extend `createApiKey(userId, rawKey, name, limits)` to accept an optional `limits` arg; when provided, set `rate_limit_per_minute`/`rate_limit_per_day` in the INSERT, otherwise omit those columns so the table defaults (60/1000) apply
- [x] 1.3 Confirm the function still returns the same shape and that omitting `limits` reproduces current behaviour for all existing callers

## 2. Admin-by-user-id helper

- [x] 2.1 In `packages/back/routes/shared/auth.js`, add `isAdminUserId(userId)` that loads `oidcSubjects` via `account.findByUserId(userId)` and returns whether any subject is in the existing module-level `adminUserSubs` list
- [x] 2.2 Export `isAdminUserId` alongside `isAdmin`

## 3. Wire both mint routes

- [x] 3.1 In `packages/back/routes/auth.js` `/cli-token`, compute admin limits via `isAdminUserId(result.userId)` and pass `ADMIN_API_KEY_RATE_LIMITS` (else `undefined`) to `createApiKey`
- [x] 3.2 In `packages/back/routes/auth.js` `/api-keys/exchange-handoff`, do the same using `user.id`
- [x] 3.3 Add the necessary imports (`isAdminUserId`, `ADMIN_API_KEY_RATE_LIMITS`) to `routes/auth.js`

## 4. Tests

- [x] 4.1 Add a backend test (following `packages/back/test/tests/admin/` patterns) that, with `ADMIN_USER_SUBS` set to the minting account's subject, asserts the minted key row has `rate_limit_per_minute`/`rate_limit_per_day` equal to the unlimited values
- [x] 4.2 Add a test asserting a non-admin account's minted key gets the default 60/1000 limits
- [ ] 4.3 Run the backend test suite and confirm the new tests pass <!-- BLOCKED: no Postgres available in this environment (brew-owned data dirs inaccessible to current user, disk ~98% full) -->>

## 5. Verification

- [x] 5.1 Run `openspec validate admin-api-key-unlimited-rate-limits` and confirm it passes
- [ ] 5.2 Manually mint a key for an admin account and confirm an analyser run no longer hits `429` <!-- BLOCKED: requires a live backend + analyser run -->>
