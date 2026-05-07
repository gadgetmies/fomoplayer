---
id: 035
title: Document that the consumer's apiOrigin must equal its public origin
effort: S
created: 2026-05-07
---

# Document that the consumer's apiOrigin must equal its public origin

## Why

The handoff token's `audience` is bound to the consumer's public origin
on mint (`new URL(handoffTarget).origin` from `getRequestOrigin(req)`),
but verified on the consumer side against `config.apiOrigin`. If the
consumer's `apiOrigin` doesn't match its public origin, the audience
check at `/login/google/handoff` rejects every otherwise-valid token
with `verifyHandoffToken` returning `null` — silently — and the user
lands on `?loginFailed=true` with no obvious clue.

This bit a real deployment: `PREVIEW_DEPLOYMENT.md`'s "Recommended"
section says *"Do not set `API_URL` for preview/prod frontend builds"*,
which is correct guidance for the **frontend bundle** (so it uses
relative `/api`) but is easy to misread as guidance for the **backend
service**, where `API_URL` is the source of `config.apiOrigin`. Without
it set on the backend, `apiOrigin` falls back to
`http://localhost:${PORT}` and the audience check fails.

## What

- Add a one-line note in `PREVIEW_DEPLOYMENT.md`'s consumer-config
  section ("PR-preview consumer configuration (handoff target)")
  stating that `API_URL` (or `IP/PORT`) on the backend service must
  resolve to the consumer's *public* origin, because the handoff token
  audience check at `/login/google/handoff` compares against
  `config.apiOrigin`.
- Disambiguate the "Recommended" / "Do not set `API_URL`" block:
  clarify that this guidance applies to the **frontend build**, not the
  **backend service**.
- Optionally also surface the same caveat in `docs/auth/oidc-login-flow.md`
  under the consumer per-environment configuration section.

## Acceptance criteria

- [ ] `PREVIEW_DEPLOYMENT.md` consumer-config section names the
      requirement explicitly: backend's `apiOrigin` must equal the
      service's public origin, and the practical implication is that
      `API_URL` on the backend must be set to that origin (or `IP/PORT`
      must resolve to it).
- [ ] The "Recommended (same domain, path-based routing)" block clearly
      scopes the "do not set `API_URL`" guidance to the frontend build.
- [ ] No code changes — this is a docs-only item. The current backend
      behaviour (audience-binding on `apiOrigin`) is correct and
      shouldn't be relaxed.

## Code pointers

- `PREVIEW_DEPLOYMENT.md:5-9` — "Recommended (same domain, path-based
  routing)" block. Add a frontend-vs-backend disambiguation here.
- `PREVIEW_DEPLOYMENT.md:88-107` — "PR-preview consumer configuration
  (handoff target)" section. Add the explicit `API_URL` requirement
  here.
- `packages/back/config.js:11` — `apiURL = resolveServiceURL(...)` is
  the source of `apiOrigin`. No change needed; just reference for
  readers.
- `packages/back/routes/auth.js:667-672` — `verifyHandoffTokenFn` call
  with `audience: apiOrigin`. The match-or-die semantics are intentional;
  the docs need to make the prerequisite obvious.
- `packages/back/routes/auth.js:618-630` — mint side. Audience comes
  from `targetOrigin = new URL(handoffTarget).origin` where
  `handoffTarget = getRequestOrigin(req)` on the consumer's
  `/login/google` redirect. So `apiOrigin == getRequestOrigin(req)` is
  the required equality.

## Out of scope

- Relaxing the audience check (e.g., accepting any of a list of public
  origins). The strict binding is a deliberate security boundary.
- Auto-detecting `apiOrigin` from request headers at runtime — the
  audience check happens before any request, when the strategy is
  configured.

## Open questions

- Should `validateAuthConfig` (in
  `packages/back/routes/shared/auth-config-validator.js`) extend its
  fail-fast checks to also throw when the backend looks like a consumer
  but its `apiOrigin` is `localhost`-shaped (i.e. `API_URL` was unset
  on the backend service)? The handoff-token audience check at
  `/login/google/handoff` would still fail at runtime, but a startup
  throw would catch it earlier. Tradeoff: dev / local-only setups
  legitimately have a localhost `apiOrigin` and shouldn't fail to
  boot. A check would need a "this looks like a deployed environment"
  predicate (e.g. `isProduction || isPreviewEnv`).
