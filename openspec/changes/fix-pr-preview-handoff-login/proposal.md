## Why

Logging in from a PR preview environment (e.g. `https://fomoplayer-<service>-<project>-pr-NNN.up.railway.app`) is broken. The PR preview is configured as a handoff *consumer* and the previewbase acts as the OIDC *authority*, but the round trip never completes back to the PR preview. Two reproducible failure modes both indicate the previewbase's OIDC return is failing to deliver the handoff redirect: when the user is already logged into the previewbase, they remain on the previewbase with no PR-preview session; when they are not, the previewbase callback ends at `/?loginFailed=true` instead of redirecting to the consumer's `/login/google/handoff` endpoint.

Field-confirmed root cause: passport-openidconnect's default
`SessionStateStore` rejects the OIDC return with `"Unable to verify
authorization request state."` because the session row that stores
`{ returnPath, handoffTarget }` does not survive the Google round trip.
The strategy fails *before* our return handler runs, so any logic added
in the return handler — including the cookie sidechannel from the first
iteration of this change — never executes. A secondary contributing
factor is that the original allowlist construction (Railway env vars
interpolated into a regex in code) made the authority Railway-specific
and silently rejected every target host when the env was misconfigured;
operators couldn't tell which guard tripped without server-side
instrumentation.

## What Changes

- Make the cross-origin handoff round trip complete end-to-end so a user starting from a PR preview ends authenticated on the originating PR preview origin, on `returnPath`.
- Cover both cold-start and the case where the previewbase already has a session for that user — the presence of an existing previewbase session must not swallow the handoff. The previewbase must not call `req.login` on itself when `handoffTarget` is set.
- Replace passport-openidconnect's session-backed state store with a stateless signed-JWT store registered via the strategy's `store:` option. The OIDC `state` query parameter becomes the signed payload itself, so state delivery does not depend on express-session, the session cookie surviving cross-site OIDC return, or pg-session row availability. CSRF protection is preserved through HMAC signature + `aud=oidc-state` + `exp`.
- Replace the Railway-specific hostname allowlist (built in code from `RAILWAY_SERVICE_NAME` + `RAILWAY_PROJECT_NAME`) by reusing the existing `ALLOWED_PREVIEW_ORIGIN_REGEX` env var that already authorizes preview origins for CORS. Operators don't configure two parallel allowlists; the code carries no Railway naming assumptions.
- Drop the now-redundant `OIDC_HANDOFF_URL` env var: derive the handoff URL as `${AUTH_API_URL}/auth/login/google` and the authority origin from `AUTH_API_URL` itself. PR-preview consumers were already setting `AUTH_API_URL` to the authority; `OIDC_HANDOFF_URL` was a duplicate that could drift.
- Add diagnostic logging on the previewbase side that names which branch failed (handoff target rejected with allowlist-not-configured / origin-not-allowed, mint failed, identity missing) so future regressions are debuggable from logs alone.
- Add automated cascade-tests for the stateless state store (12 unit tests) and the handoff happy path on the authority's `/login/google/return` (cold-start and existing-session scenarios).
- Document the required previewbase env (`ALLOWED_PREVIEW_ORIGIN_REGEX`, plus the handoff secret) and the consumer env (`AUTH_API_URL`, `OIDC_HANDOFF_SECRET`) so misconfigured deployments fail loudly rather than silently rejecting every PR preview hostname.

## Capabilities

### New Capabilities
- `pr-preview-auth-handoff`: Cross-origin OIDC handoff between a PR preview backend (consumer) and the previewbase backend (authority). Covers `/login/google` delegation on the consumer, `/login/google` and `/login/google/return` handoff branching on the authority, the safe-handoff-target check, the `/login/google/handoff` consume endpoint, and the diagnostic logging contract.

### Modified Capabilities
<!-- None — there is no existing spec for the auth handoff capability today. -->

## Impact

- `packages/back/passport-setup.js` — pass a `StatelessStateStore` instance as the `store:` option on the OpenIDStrategy. CLI and extension OIDC flows go through the same store; their `state: { returnToCli, ... }` / `state: { returnToExtension, ... }` payloads continue to round-trip via the JWT-encoded state.
- `packages/back/routes/shared/oidc-state-store.js` (new) — `StatelessStateStore` class implementing the passport-openidconnect store interface (`store(req, ctx, appState, meta, cb)` / `verify(req, handle, cb)`). Signs `{ ctx, appState }` with `config.sessionSecret` and `aud=oidc-state`, 10 min TTL.
- `packages/back/routes/auth.js` — `/login/google`, `/login/google/return`, `/login/google/handoff`. The authority-side branch unconditionally takes the handoff path when `handoffTarget` is present in `info.state`, regardless of any pre-existing session.
- `packages/back/routes/shared/safe-redirect.js` — `isSafeHandoffTarget` becomes a thin wrapper around `evaluateHandoffTarget(url, allowedOriginRegexes)`. The allowlist comes from the caller (sourced from `config.allowedPreviewOriginRegexes`) instead of `process.env.RAILWAY_SERVICE_NAME` / `RAILWAY_PROJECT_NAME`, so the code has no Railway-specific assumptions.
- `packages/back/config.js` — exposes the existing `allowedPreviewOriginRegexes` (parsed from `ALLOWED_PREVIEW_ORIGIN_REGEX`) on the config object for the auth router; derives `oidcHandoffUrl` and `oidcHandoffAuthorityOrigin` from `authApiURL` instead of reading separate env vars.
- `packages/back/test/tests/users/auth/` — new cascade-tests for the stateless state store (`oidc-state-store.js`) and the handoff happy path / existing-session regression / consumer delegation / structured failure logs / startup warning (`handoff-login-return.js`).
- `PREVIEW_DEPLOYMENT.md` and `docs/auth/oidc-login-flow.md` — describe the stateless state store, the reuse of `ALLOWED_PREVIEW_ORIGIN_REGEX` for the handoff allowlist, the derivation of the handoff URL from `AUTH_API_URL`, and the structured failure logs.
- No DB schema, frontend, or extension changes. CLI and extension login flows are out of scope (their existing state shapes ride the new state store transparently).
