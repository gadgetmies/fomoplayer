## Why

Local development on `localhost` currently fails to start the backend in
common configurations because `validateAuthConfig` (called from
`packages/back/config.js`) misidentifies a local dev backend as a
"handoff consumer" whenever `AUTH_API_URL`'s origin differs from
`apiOrigin` — for example, running the backend on port 4000 and the
frontend on port 3000 with the default `AUTH_API_URL` fallback to
`${frontendURL}/api`. The validator then throws asking for
`OIDC_HANDOFF_SECRET`, even though the developer has no intention of
participating in the handoff flow.

The fix is to gate **all** OIDC handoff configuration on
`PREVIEW_ENV=true`. Both deployment roles that participate in handoff —
the previewbase (authority) and PR previews (consumers) — already have
`PREVIEW_ENV=true` set in their environment. Local dev is the only
context where `PREVIEW_ENV` is unset, and that is exactly where handoff
should be dormant.

A developer who genuinely wants to test handoff locally (either
consumer-side against a remote authority, or authority-side against a
remote consumer) can opt in by setting `PREVIEW_ENV=true` together with
the relevant handoff env vars. This matches what real preview
deployments do.

## What Changes

- In `packages/back/config.js`, compute `isPreviewEnv` before calling
  `validateAuthConfig`. When `!isPreviewEnv`, force the handoff-related
  values to `undefined` / empty regardless of the underlying env vars:
  - `oidcHandoffSecret = undefined`
  - `oidcHandoffUrl = undefined`
  - `oidcHandoffAuthorityOrigin = undefined`
  - `allowedPreviewOriginRegexes = []`
- `validateAuthConfig`, `auth.js`'s `canMintHandoff` /
  `isHandoffConsumerConfigured` derivations, and the
  `passport-openidconnect` strategy already gate behaviour on
  `Boolean(secret && origin)`-shaped checks. They need no edits — once
  the values are `undefined` upstream, every downstream condition
  evaluates to "off".
- Extend the existing `config-preview-access.js` cascade-test (or a
  sibling) with cases for the local-dev scenario: `PREVIEW_ENV` unset +
  `AUTH_API_URL` set to a different origin + no `OIDC_HANDOFF_SECRET`
  → config module loads cleanly, no startup throw. Plus an assertion
  that the exported `oidcHandoffSecret` is `undefined` when
  `PREVIEW_ENV` is unset even if the env var is present.
- Add a "Testing handoff locally" paragraph to
  `docs/auth/oidc-login-flow.md` enumerating the env vars to set
  (`PREVIEW_ENV=true`, `OIDC_HANDOFF_SECRET`, `AUTH_API_URL`,
  `ALLOWED_PREVIEW_ORIGIN_REGEX` on whichever side is acting as
  authority, etc.).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-preview-auth-handoff`: add a `PREVIEW_ENV=true` precondition to
  the existing requirements that describe handoff trigger conditions
  ("Consumer delegates", "Authority preserves handoffTarget",
  "Authority handoff branch", "Authority `/login/google` mints handoff
  token", "Authority startup warning when allowlist is empty"), and add
  a new requirement asserting handoff is dormant when `PREVIEW_ENV` is
  unset.

## Impact

- **Code**: `packages/back/config.js` — re-order the `isPreviewEnv`
  computation and add a single conditional. ~10 lines, no new files.
- **Tests**: extend `packages/back/test/tests/users/auth/config-preview-access.js`
  with two scenarios. No new test infrastructure needed.
- **Docs**: one new section in `docs/auth/oidc-login-flow.md`. No
  changes to `PREVIEW_DEPLOYMENT.md` (the deployment env vars are
  unchanged).
- **APIs**: none. The HTTP routes' observable behaviour is unchanged
  for both real preview deployments (where `PREVIEW_ENV=true`) and
  local dev (handoff was already not working there because the secret
  wasn't set; now the validator stops shouting about it).
- **Risk**: low. The change tightens one precondition and is
  mechanical. Production deployments are unaffected because they already
  set `PREVIEW_ENV=true`.
