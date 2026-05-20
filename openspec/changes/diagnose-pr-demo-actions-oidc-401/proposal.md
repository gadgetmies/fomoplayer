## Why

The `PR Demo Test` workflow successfully deploys a Railway PR preview and
mints a GitHub Actions OIDC token, but cascade-test's remote-preview login
against `/api/auth/login/actions` is rejected with HTTP 401 — `Invalid or
unauthorized Actions token`. The current backend implementation collapses
six independent failure modes (JWKS fetch error, signature mismatch,
expired token, issuer mismatch, audience mismatch, algorithm mismatch,
repository-claim mismatch) into a single opaque `logger.warn` that says
only "invalid or unauthorized token", so neither the Railway log nor the
GitHub Actions log identifies which check fired. Without that signal we
cannot move past the 401 — every hypothesis (trailing slash in audience,
JWKS network failure, wrong `repository` claim, etc.) costs a full
build-deploy-rerun cycle to disprove.

We need the backend to tell us exactly which check failed on the next
attempt, then we can ship the targeted fix and unblock the demo workflow.

## What Changes

- `packages/back/routes/shared/github-actions-oidc.js`:
  `verifyActionsToken` accepts an optional `logger` argument. On every
  rejection path it emits one structured `logger.warn` with a stable
  `reason` enum value plus the diagnostic context needed to identify the
  cause:
  - `jwks-key-fetch-failed` — JWKS client error before signature
    verification (includes `kid` from the unverified header and the
    underlying error message).
  - `signature-or-claim-verification-failed` — `jwt.verify` rejected the
    token. Includes the decoded *unverified* claims (`iss`, `aud`, `sub`,
    `repository`, `exp`, `alg`) so audience/issuer/exp mismatches are
    obvious from the log line, plus the `jsonwebtoken` error name (e.g.
    `JsonWebTokenError`, `TokenExpiredError`) and message.
  - `repository-claim-mismatch` — signature verified but `payload.repository`
    did not equal `allowedRepo`. Logs the observed vs. expected repo.
  - `verifier-input-missing` — at least one of `token`, `audience`, or
    `allowedRepo` was falsy at call time. Logs which one(s).

  Each warning also includes `expectedAudience`, `expectedRepo`, and
  `issuer = GITHUB_ACTIONS_ISSUER` so the operator can compare expected
  vs. observed claims in a single line.

  When no `logger` is passed, the function preserves today's behaviour
  (silent rejection) so existing call sites and tests are unaffected
  until they opt in.

- `packages/back/routes/auth.js` `/login/actions` route: pass the request
  logger into `verifyActionsTokenFn`. Drop the existing line-790
  `logger.warn('Actions OIDC login rejected: invalid or unauthorized
  token')` — the verifier's structured warn replaces it.

- After deploying the instrumentation to the Railway PR preview and
  reading the Railway log on the next `PR Demo Test` run, apply the
  targeted fix indicated by the `reason` and observed claims (most
  likely audience-string normalization between the workflow's
  `audience=${PREVIEW_URL}` and the backend's `apiOrigin = new
  URL(apiURL).origin`, but the diagnostic could implicate JWKS or
  repository claim instead). The fix lands in the same change so the
  full diagnose → identify → fix arc is captured together.

- Cascade-tests in `packages/back/test/tests/users/auth/actions-oidc-login.js`:
  add a case asserting that when `verifyActionsTokenFn` returns null and
  the request supplied a logger via the standard middleware, the
  rejection path does not emit the now-removed opaque "invalid or
  unauthorized token" warn (negative assertion against the old log
  string). Add a unit-level cascade-test for `verifyActionsToken` itself
  that exercises each failure path against a fake `logger` and asserts
  the structured `reason` emitted.

## Capabilities

### New Capabilities

- `actions-oidc-login`: GitHub Actions OIDC bot-login flow that lets
  `cascade-test` (running inside `PR Demo Test`) exchange a workflow OIDC
  token for a session on the PR preview backend. Covers the
  diagnostic-logging contract introduced by this change.

### Modified Capabilities

None.

## Impact

- **Code**: `packages/back/routes/shared/github-actions-oidc.js` gains
  ~30 lines (decode-unverified path, four log call sites). `auth.js`
  changes one line at the route call site.
- **Tests**: extend `actions-oidc-login.js` with new cases; add a unit
  cascade-test for the verifier's logging contract.
- **Docs**: no new doc file. The structured `reason` enumeration is
  documented in this change's `design.md` and surfaced in code via the
  function's behaviour.
- **APIs**: no API surface change. `/api/auth/login/actions` request
  and response shapes are unchanged. The only externally observable
  change is the contents of the backend log.
- **Workflow**: no `.github/workflows/pr-demo.yml` changes are required
  for the diagnostic step. If the eventual root-cause fix is a workflow
  change (e.g. audience normalization on the GitHub side), this change
  documents it; otherwise the workflow stays as-is.
- **Risk**: low. The instrumentation is purely additive on the
  unverified path (uses `jsonwebtoken.decode`, which never executes
  signature verification). The targeted fix is constrained to one of
  three small surfaces (audience string, JWKS fetch, repo claim) and
  the change is gated on observing the diagnostic first.
