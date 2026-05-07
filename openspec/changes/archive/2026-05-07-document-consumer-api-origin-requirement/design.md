## Context

This is a documentation-only change. The behavior being documented is
already implemented and covered by the existing
`pr-preview-auth-handoff` capability:

- `packages/back/routes/auth.js:618-630` — handoff token mint binds
  `audience` to `targetOrigin = new URL(handoffTarget).origin`, where
  `handoffTarget = getRequestOrigin(req)` on the consumer's
  `/login/google` redirect.
- `packages/back/routes/auth.js:667-672` — handoff token verify uses
  `audience: apiOrigin` (sourced from `config.apiOrigin`, derived from
  `API_URL` / `IP+PORT` at startup in `packages/back/config.js:11`).

The required equality `apiOrigin == getRequestOrigin(req)` is therefore a
deployment-time configuration prerequisite. When violated, the audience
check rejects every otherwise-valid token and the user lands on
`?loginFailed=true`. There is no log line that names this specific cause
today (the `verifyHandoffToken` failure path collapses signature, aud,
exp, and replay rejections into `null`), so the only fix that addresses
the operator-experience problem is making the prerequisite obvious in
the deployment docs.

The existing `PREVIEW_DEPLOYMENT.md` "Recommended (same domain,
path-based routing)" block at `PREVIEW_DEPLOYMENT.md:5-9` says
*"Do not set `API_URL` for preview/prod frontend builds"* — accurate
guidance for the **frontend bundle** (so it uses relative `/api`), but
easily misread as a directive for the **backend service** environment.
A consumer backend running without `API_URL` falls back to
`http://localhost:${PORT}` for `apiOrigin`, which never matches a
public origin and silently breaks every handoff.

## Goals / Non-Goals

**Goals:**

- Make the consumer-side configuration prerequisite
  (`apiOrigin == public origin`) discoverable from `PREVIEW_DEPLOYMENT.md`
  alone, without needing to read the auth router source.
- Disambiguate the existing "do not set `API_URL`" guidance so it
  cannot be misread as a directive for the backend service.
- Keep the documentation requirement enforceable at the spec level,
  parallel to the existing previewbase-side allowlist documentation
  requirement.

**Non-Goals:**

- Relaxing or auto-detecting the audience check at runtime. The strict
  binding is a deliberate security boundary and the audience is set when
  the token is minted, before the token's recipient request exists.
- Adding a new fail-fast startup check on the consumer for "looks like
  a deployed environment but `apiOrigin` is `localhost`-shaped". The
  task README's open question covers this; it would need a
  `isProduction || isPreviewEnv` predicate to avoid breaking dev/local
  setups, and the docs change alone is enough to close the operator-UX
  gap. Defer to a follow-up if the docs change isn't sufficient in
  practice.
- Extending the handoff failure log path to surface
  `audience-mismatch` separately. Out of scope for a docs-only change;
  the existing log already records "verifyHandoffToken returned null"
  and the docs are the cheaper fix.

## Decisions

**Document on the spec-level requirement, not in free-floating prose.**
The existing `pr-preview-auth-handoff` spec already has a
"Documented previewbase configuration" requirement that pins the
previewbase-side env var (`ALLOWED_PREVIEW_ORIGIN_REGEX`) into the spec.
Mirror that pattern for the consumer side (`apiOrigin` / `API_URL`) so
the documentation prerequisite has the same enforcement surface. This
keeps the two halves of the deployment story symmetric.

Alternative considered: leave the docs change as a freeform README edit
without a spec requirement. Rejected because the previewbase-side
documentation is already a spec requirement, and the operator-UX bug
this change fixes is on the consumer side — exactly the half currently
under-specified.

**Add the requirement to `pr-preview-auth-handoff`, not a new spec.**
The consumer's `apiOrigin` configuration is part of the same handoff
capability already documented; carving out a separate spec would
fragment the auth-handoff documentation contract.

**Use MODIFIED on the existing "Documented previewbase configuration"
requirement, generalizing it.** Rather than ADDED a parallel requirement,
broaden the existing one to cover *both* sides (previewbase and
consumer) — that's what the deployment doc actually documents in one
section. This avoids two near-duplicate requirements that drift.

Alternative considered: ADD a separate "Documented consumer
configuration" requirement next to the existing previewbase one.
Rejected because the two are aspects of the same documentation surface
(`PREVIEW_DEPLOYMENT.md`); a single combined requirement is easier to
keep in sync.

## Risks / Trade-offs

- **Risk:** Operators continue to misread the "Recommended" block and
  ship a backend without `API_URL`. → **Mitigation:** the disambiguation
  is added to *that exact block*, not just the consumer section, so a
  reader who only skims the top of `PREVIEW_DEPLOYMENT.md` still sees
  the frontend-vs-backend distinction.
- **Risk:** The docs go out of sync with future code changes that move
  `apiOrigin` derivation. → **Mitigation:** the spec requirement names
  the prerequisite ("`apiOrigin` MUST equal the service's public origin")
  rather than the env var, so any future config-loader refactor still
  has to satisfy the prerequisite. The env var is mentioned as the
  practical mechanism, not the contract.

## Migration Plan

Not applicable — docs-only change. Merge ships the documentation
update; no deploy-time coordination needed.

## Open Questions

- Should `validateAuthConfig` (in
  `packages/back/routes/shared/auth-config-validator.js`) extend its
  fail-fast checks to throw when a consumer's `apiOrigin` is
  `localhost`-shaped in a deployed environment? The task README flags
  this as a follow-up; not blocking this change.
