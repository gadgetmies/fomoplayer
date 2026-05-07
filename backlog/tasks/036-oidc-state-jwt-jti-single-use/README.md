---
id: 036
title: Make the OIDC state JWT single-use via jti consumption
effort: S
created: 2026-05-07
---

# Make the OIDC state JWT single-use via jti consumption

## Why

The `StatelessStateStore` we use for `passport-openidconnect` signs
`{ ctx, appState }` as a JWT (HS256, `aud=oidc-state`, 10 min TTL,
keyed on `SESSION_SECRET`). The signature plus `aud` and `exp`
prevent forgery and bound replay to the TTL, but the JWT itself has
no `jti` and no consumption record — so within the 10-minute window
the same state JWT can be re-presented to `/login/google/return`
multiple times paired with different Google authorization codes.

In practice this isn't an exploitable escalation: each presentation
yields a different OIDC user identity (whoever's Google session
authorized the code), and Google's authorization code is single-use,
so the only thing an attacker can do with a captured state is log
**themselves** in to the `handoffTarget` they captured — which is the
same thing they could do by starting a fresh `/login/google` flow.

But the theoretical replay window is detectable in logs, complicates
incident response (replays look identical to legitimate retries), and
the existing `auth_handoff_jti` table already provides exactly the
single-use primitive we'd need. Closing the window costs almost
nothing.

## What

- Add a `jti` claim to the JWT minted by
  `StatelessStateStore.prototype.store` (use `crypto.randomUUID()`).
- In `StatelessStateStore.prototype.verify`, after signature/aud/exp
  pass, call `consumeHandoffJti(payload.jti, expiresAt)` (re-use the
  existing table) and reject with `cb(null, false, { message: 'OIDC
  state replay rejected' })` if the row was already inserted.
- Add a structured warn log on replay rejection, mirroring the
  `auth_handoff_jti` rejection path:
  `logger.warn('OIDC state replay rejected', { jti })`.
- The store currently has no `consumeHandoffJti` reference and no
  `logger`; thread them in via the constructor:
  `new StatelessStateStore({ secret, issuer, consumeJti, logger })`,
  with `consumeJti` defaulting to the existing
  `consumeHandoffJti` import and `logger` defaulting to a no-op.

## Acceptance criteria

- [ ] State JWT mint emits a unique `jti` claim every time.
- [ ] State JWT verify consumes the `jti` via the existing
      `auth_handoff_jti` table; second use of the same JWT fails the
      verify callback with the same shape passport-openidconnect
      rejects today (`cb(null, false, { message })`).
- [ ] Replay rejection emits a structured warn log naming the `jti`
      and the reason; the existing
      `OIDC authentication produced no user` log line surfaces the
      replay path naturally because passport's strategy will call our
      auth-handler with `user=false`.
- [ ] Cascade-tests cover: roundtrip with consumption succeeds first
      time and fails second time; concurrent consumption of the same
      `jti` (two requests racing) results in exactly one success.
- [ ] No regression in the existing 12 `oidc-state-store` cascade-tests
      and 16 `handoff-login-return` cascade-tests.

## Code pointers

- `packages/back/routes/shared/oidc-state-store.js:14` — `store()`
  signs the JWT. Add `jti: crypto.randomUUID()` to the payload (or use
  `jwt.sign`'s `jwtid` option).
- `packages/back/routes/shared/oidc-state-store.js:32` — `verify()`
  decodes the JWT. After successful decode, await
  `consumeHandoffJti(payload.jti, new Date(payload.exp * 1000))` and
  reject if it returns false.
- `packages/back/routes/shared/auth-handoff-jti.js:4` — existing
  `consumeHandoffJti` is re-usable as-is. The `auth_handoff_jti` table
  already has the right column shape and `ON CONFLICT DO NOTHING`.
- `packages/back/passport-setup.js:67` — strategy is constructed with
  `new StatelessStateStore({ secret, issuer })`. Extend the constructor
  call to pass `consumeJti` and `logger`.
- `packages/back/test/tests/users/auth/oidc-state-store.js` — extend
  with replay scenarios.

## Out of scope

- Switching the OIDC state JWT secret away from `SESSION_SECRET`.
- Reducing the 10-minute TTL. The TTL is a UX margin (slow user,
  Google interstitials, retries); single-use enforcement is the
  better lever.
- Splitting the `auth_handoff_jti` table by token type (state-jti vs
  handoff-jti). The table column is opaque; mixing is fine.

## Open questions

- Race-condition tests need a real Postgres connection (or a
  carefully-mocked `consumeJti`). The cascade-test
  `auth_handoff_jti`-touching cases may need to live in the integration
  bucket rather than the in-process bucket.
- Should we also add a `jti` to the handoff token verification path
  on the consumer side that doesn't already do it? Quick read:
  `auth.js:678` already calls `consumeHandoffJti(payload.jti, ...)`, so
  the handoff-token side is already covered. Only the state JWT is
  missing this.
