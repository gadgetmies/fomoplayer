## Context

`packages/back/config.js` runs at module-load time. It synchronously
derives a handful of auth-related origins from env vars, calls
`validateAuthConfig` to fail-fast on inconsistent configurations, then
exports the values. Today the validator fires a misleading error in
local dev when:

- `AUTH_API_URL` defaults to `${frontendURL}/api` because no explicit
  override is set,
- the backend's `apiURL` resolves to a different origin than
  `frontendURL` (e.g. backend on port 4000, frontend on port 3000,
  which is the default `npm run start` shape on this project),
- and `OIDC_HANDOFF_SECRET` is unset (because the developer is not
  doing anything related to handoff).

The validator's "looks like consumer but no secret" guard fires, the
backend refuses to start, and the developer gets a 500-character error
about a feature they're not using.

Both deployment roles that *do* use handoff — the previewbase
(authority) and each PR preview (consumer) — already set
`PREVIEW_ENV=true`. PR previews inherit the previewbase's environment,
which sets it; the previewbase sets it explicitly so the OIDC sub
allowlist gating fires. So `PREVIEW_ENV=true` is a reliable single
signal for "this backend participates in handoff."

The fix is to gate the entire handoff configuration on `PREVIEW_ENV`.
The downstream code already treats handoff-related values as opt-in
via `Boolean(secret && origin)` shaped checks, so we can do this
purely at the config layer.

## Goals / Non-Goals

**Goals:**
- Local dev with no handoff env vars set boots cleanly regardless of
  `AUTH_API_URL` shape.
- Production previewbase and PR-preview deployments are unaffected.
- A developer can opt into handoff locally by setting `PREVIEW_ENV=true`
  plus the usual handoff env vars (`OIDC_HANDOFF_SECRET`,
  `AUTH_API_URL`, etc.) — the gate doesn't lock dev out of testing.
- The capability spec captures `PREVIEW_ENV=true` as the precondition
  for handoff behaviour.

**Non-Goals:**
- Renaming or splitting `PREVIEW_ENV` into `HANDOFF_ENABLED` or
  similar. The deployment model already wires `PREVIEW_ENV` through to
  both roles; minting a separate flag would add complexity for no
  user-visible benefit.
- Reworking how `apiOrigin` / `authApiOrigin` are derived. The fallback
  `authApiURL = process.env.AUTH_API_URL || \`${frontendURL}/api\`` is
  load-bearing for non-handoff request paths.
- Touching `validateAuthConfig` itself. With handoff vars forced to
  `undefined` upstream, both validator branches naturally short-circuit.
- Adding a CLI flag or runtime toggle. The gate is a deploy-time env
  var.

## Decisions

### Decision 1: Gate at the config layer, not the validator or the route

Three plausible places to add the gate:

| Where                     | What it gates                       | Effect                                   |
|---------------------------|-------------------------------------|------------------------------------------|
| `config.js` (chosen)      | the exported handoff values         | every downstream consumer naturally off  |
| `validateAuthConfig`      | the throw                           | startup passes, but `auth.js` would still try to delegate / mint with bad config |
| `auth.js` route handlers  | the runtime branches                | most invasive; multiple call sites; easy to miss one |

Choosing the config layer keeps the gate in one place. `auth.js` and
`validateAuthConfig` already read these values through opt-in checks;
once they see `undefined`, every codepath downstream is off. No
changes elsewhere.

### Decision 2: Force values to `undefined` rather than skip the validator

A simpler-looking variant would be to skip `validateAuthConfig` entirely
when `!isPreviewEnv`. Rejected: it leaves the exported handoff values
populated (so e.g. `auth.js` would still see a non-empty
`oidcHandoffUrl` and could decide to delegate `/login/google` even
though no secret is set on the consumer side). Forcing the values
ensures consistency: if `PREVIEW_ENV` is unset, *every* observer of
handoff config sees the same "off" state.

### Decision 3: Also gate `allowedPreviewOriginRegexes`

`ALLOWED_PREVIEW_ORIGIN_REGEX` is the authority-side allowlist for
handoff targets. Strictly speaking it has no effect on a non-authority
backend (the authority branch checks it; nothing else reads it). But
gating it for consistency means `config.allowedPreviewOriginRegexes`
is always `[]` in local dev, which removes any chance of the regexes
participating in CORS-origin checks unintentionally (the export is
folded into `allowedOriginRegexes`).

### Decision 4: Spec change — modify trigger conditions, add dormancy requirement

The existing requirements in `pr-preview-auth-handoff` describe trigger
conditions like "When a backend is configured as a handoff consumer
(`oidcHandoffUrl`, `oidcHandoffAuthorityOrigin`, and `oidcHandoffSecret`
are all set...)". After this change those conditions are gated on
`PREVIEW_ENV=true`. Two options for the spec:

1. Modify each affected requirement's preamble to add the
   `PREVIEW_ENV=true` precondition.
2. Add a single new requirement at the top that says "all handoff
   behaviour requires `PREVIEW_ENV=true`" and leave the existing ones
   alone.

Option 1 is more verbose but keeps each requirement self-contained — a
reader looking only at "Consumer delegates" sees the full precondition
without having to find a sentinel elsewhere. Choosing Option 1.

Plus a new requirement: "Handoff configuration is dormant when
`PREVIEW_ENV` is unset" with scenarios covering the local-dev
boot-cleanly case.

## Risks / Trade-offs

- **Risk: a future deployment forgets to set `PREVIEW_ENV=true`.**
  → Mitigation: existing `PREVIEW_ALLOWED_GOOGLE_SUBS` check at
  `config.js:45-47` would also fail-loud in that case (the previewbase
  needs `PREVIEW_ENV=true` for the Google sub allowlist to gate
  correctly). So a missing `PREVIEW_ENV` would surface via more than
  one path.

- **Risk: a developer sets `PREVIEW_ENV=true` locally without setting
  the other handoff vars, then complains about a similar startup
  error.**
  → That's the point: setting `PREVIEW_ENV=true` is a deliberate
  opt-in, and at that point the existing validator errors are
  appropriate. The doc paragraph in `docs/auth/oidc-login-flow.md`
  enumerates the vars to set together.

- **Trade-off: the gate is binary.** A developer who wants the backend
  up locally *and* full handoff behaviour wired against a real authority
  must set the same env vars a real consumer sets. There's no
  intermediate "validate as if production but otherwise no-op" mode.
  Acceptable — that intermediate mode wasn't a thing before this
  change either.
