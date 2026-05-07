## Why

Logging in from a PR preview environment (e.g. `https://fomoplayer-<service>-<project>-pr-NNN.up.railway.app`) is broken. The PR preview is configured as a handoff *consumer* and the previewbase acts as the OIDC *authority*, but the round trip never completes back to the PR preview. Two reproducible failure modes both indicate the previewbase's OIDC return is failing to deliver the handoff redirect: when the user is already logged into the previewbase, they remain on the previewbase with no PR-preview session; when they are not, the previewbase callback ends at `/?loginFailed=true` instead of redirecting to the consumer's `/login/google/handoff` endpoint. The root cause appears to be a combination of the previewbase's session-backed `state` not surviving the Google round trip on the previewbase host and missing/incorrect Railway env vars (`RAILWAY_SERVICE_NAME`, `RAILWAY_PROJECT_NAME`) that gate `isSafeHandoffTarget`. Today we cannot tell which guard tripped without server-side instrumentation.

## What Changes

- Make the cross-origin handoff round trip complete end-to-end so a user starting from a PR preview ends authenticated on the originating PR preview origin, on `returnPath`.
- Cover both cold-start and the case where the previewbase already has a session for that user — the presence of an existing previewbase session must not swallow the handoff. The previewbase must not call `req.login` on itself when `handoffTarget` is set.
- Harden `state` propagation across the previewbase OIDC round trip so `handoffTarget` is never silently lost (e.g. fall back to a signed/encrypted state value if the session-backed state is missing on return).
- Replace the Railway-specific hostname allowlist (built in code from `RAILWAY_SERVICE_NAME` + `RAILWAY_PROJECT_NAME`) with a generic `HANDOFF_TARGET_ORIGIN_REGEX` env var (comma-separated regex list, parsed the same way as `ALLOWED_ORIGIN_REGEX`). Operators express the allowed origins in environment configuration; the code carries no Railway naming assumptions.
- Add diagnostic logging on the previewbase side that names which branch failed (state lost, handoff target rejected, allowlist not configured, allowlist mismatch, mint failed, identity missing) so future regressions are debuggable from logs alone.
- Add an automated cascade-test for the handoff happy path covering both cold-start and existing-session scenarios.
- Document the required previewbase env (`HANDOFF_TARGET_ORIGIN_REGEX`, plus the handoff secret/authority origin) so misconfigured deployments fail loudly rather than silently rejecting every PR preview hostname.

## Capabilities

### New Capabilities
- `pr-preview-auth-handoff`: Cross-origin OIDC handoff between a PR preview backend (consumer) and the previewbase backend (authority). Covers `/login/google` delegation on the consumer, `/login/google` and `/login/google/return` handoff branching on the authority, the safe-handoff-target check, the `/login/google/handoff` consume endpoint, and the diagnostic logging contract.

### Modified Capabilities
<!-- None — there is no existing spec for the auth handoff capability today. -->

## Impact

- `packages/back/routes/auth.js` — `/login/google`, `/login/google/return`, `/login/google/handoff` all touched. The authority-side branch must prefer the handoff path over `req.login` when `handoffTarget` is present, regardless of any pre-existing session, and must fall back to a signed state if the session-stored state is empty on return.
- `packages/back/routes/shared/safe-redirect.js` — `isSafeHandoffTarget` becomes a thin wrapper around `evaluateHandoffTarget(url, allowedOriginRegexes)`. The allowlist comes from the caller (sourced from `config.handoffTargetOriginRegexes`) instead of `process.env.RAILWAY_SERVICE_NAME` / `RAILWAY_PROJECT_NAME`, so the code has no Railway-specific assumptions.
- `packages/back/config.js` — adds `handoffTargetOriginRegexes`, parsed from `HANDOFF_TARGET_ORIGIN_REGEX` via `parseOriginRegexes` (same shape as `ALLOWED_ORIGIN_REGEX`).
- `packages/back/test/tests/users/auth/` — new cascade-test covering the handoff happy path against an in-process Express app, plus a regression test for the existing-previewbase-session case.
- `PREVIEW_DEPLOYMENT.md` and `docs/auth/oidc-login-flow.md` — describe the new `HANDOFF_TARGET_ORIGIN_REGEX` env var, what configures it, and the structured failure logs.
- No DB schema, frontend, or extension changes. CLI and extension login flows are out of scope.
