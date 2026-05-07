---
id: 037
title: Remove the legacy /api-keys/exchange-handoff endpoint
effort: S
created: 2026-05-07
---

# Remove the legacy /api-keys/exchange-handoff endpoint

## Why

`POST /api/auth/api-keys/exchange-handoff`
(`packages/back/routes/auth.js:735-752`) accepts a self-issued handoff
token (iss == aud == `apiOrigin`) and exchanges it for a permanent
`fp_<uuid>` API key. The endpoint is wired up unconditionally on the
authority but no live code path mints the kind of token it accepts —
the only callers are the cascade-tests in
`packages/back/test/tests/users/auth/api-key-exchange.js`. The CLI flow
that's actually documented and used today goes through `/login/cli`
→ `/login/cli/google` → `/login/cli/confirm` → `/cli-token` (PKCE
authorization-code), which never produces a self-issued handoff token.

So `/api-keys/exchange-handoff` is dead at the edge: it's protected by
the same `OIDC_HANDOFF_SECRET` HMAC plus `auth_handoff_jti` replay
protection as the regular handoff path, but every accepted token would
have to be minted by an endpoint we don't currently have. The endpoint
exists, accepts requests (returns 401/403 for invalid tokens, 200 for
fabricated valid ones), and increases the auth surface area we have to
keep secure for no operational benefit.

## What

- Remove `router.post('/api-keys/exchange-handoff', ...)` from
  `packages/back/routes/auth.js`.
- Remove the cascade-test file
  `packages/back/test/tests/users/auth/api-key-exchange.js` (its only
  reason to exist is this endpoint).
- Confirm `mintHandoffToken` is still used by the regular browser
  handoff flow (it is — `auth.js:624`) and only that callsite has the
  `iss != aud` shape. The self-issued shape (`iss == aud == apiOrigin`)
  is unused once this endpoint is gone.
- Update `docs/auth/oidc-login-flow.md`'s code-pointer block — the
  current docs include `auth.js`'s `/api-keys/exchange-handoff` in the
  route list and need a one-line removal.

## Acceptance criteria

- [ ] `/api/auth/api-keys/exchange-handoff` returns 404 (route is
      gone), not 503/401/200.
- [ ] `mintHandoffToken` callsites: only `auth.js:624` remains, and
      only with `iss = apiOrigin, aud = handoffTarget origin`.
- [ ] `verifyHandoffToken` callsites: only the consumer-side
      `/login/google/handoff` remains
      (`auth.js:667-672` with `iss = oidcHandoffAuthorityOrigin,
      aud = apiOrigin`). The self-iss/aud shape is no longer
      exercised in production code.
- [ ] `api-key-exchange.js` test file is deleted; remaining auth
      cascade-tests (`handoff-login-return`, `handoff-login-signup-policy`,
      `handoff-token`, `oidc-state-store`, `passport-strategies`,
      `safe-redirect-path`, `cli-auth-code`, etc.) still pass.
- [ ] `docs/auth/oidc-login-flow.md` route list no longer mentions
      `/api-keys/exchange-handoff`.

## Code pointers

- `packages/back/routes/auth.js:735-752` — the route to remove.
- `packages/back/test/tests/users/auth/api-key-exchange.js` — the
  test file to delete.
- `packages/back/routes/shared/auth-handoff-token.js` — the
  `mintHandoffToken`/`verifyHandoffToken` helpers stay; the iss/aud
  semantics already work for the regular handoff flow.
- `docs/auth/oidc-login-flow.md` — find and remove the
  `/api-keys/exchange-handoff` line in the route list near the top.

## Out of scope

- Reworking the CLI auth flow. The PKCE-based flow in `/login/cli/*`
  is the supported path and stays as-is.
- Removing `mintHandoffToken` / `verifyHandoffToken`. They're still
  used by the regular browser handoff flow.
- Removing the `auth_handoff_jti` table or the `consumeHandoffJti`
  helper. Both stay — the regular handoff flow depends on them.

## Open questions

- Confirm there's no out-of-tree caller (e.g., a documented but
  uncommitted CLI tool, a direct curl example in any README, an
  internal admin script) that mints `iss == aud` handoff tokens. A
  quick `git log -p -S 'exchange-handoff'` and a search in
  `packages/cli/` should be enough.
- If we want to keep the *capability* of exchanging an OIDC-verified
  identity for an API key without going through the CLI PKCE browser
  dance, this endpoint is one of the building blocks. Decide whether
  to keep-and-document or remove-and-add-back-when-needed. Default
  recommendation: remove now, re-add intentionally if a use case
  emerges.
