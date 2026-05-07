## Why

The handoff token's audience is bound to the consumer's public origin at
mint time and verified against `config.apiOrigin` on the consumer at
`/login/google/handoff`. If a deployed consumer's `apiOrigin` doesn't
match its public origin (e.g. because `API_URL` was left unset on the
backend service and `apiOrigin` falls back to `http://localhost:${PORT}`),
the audience check rejects every otherwise-valid token silently and the
user lands on `?loginFailed=true` with no obvious clue. This already bit
a real PR-preview deployment because `PREVIEW_DEPLOYMENT.md`'s
"Recommended" block tells operators *"Do not set `API_URL` for
preview/prod frontend builds"* — guidance that is correct for the
**frontend bundle** but is easy to misread as guidance for the **backend
service**.

## What Changes

- Document, in `PREVIEW_DEPLOYMENT.md`'s consumer-config section
  ("PR-preview consumer configuration (handoff target)"), that the
  consumer backend's `apiOrigin` MUST equal the service's public origin,
  with the practical implication that `API_URL` on the backend must be
  set to that origin (or `IP/PORT` must resolve to it).
- Disambiguate the "Recommended (same domain, path-based routing)" block
  by scoping the "do not set `API_URL`" guidance explicitly to the
  **frontend build**, not the backend service.
- Surface the same caveat in `docs/auth/oidc-login-flow.md` under the
  consumer per-environment configuration section.
- No code changes. The current backend behaviour
  (audience-binding on `apiOrigin`) is correct and intentional; the
  documentation needs to make the prerequisite obvious.

## Capabilities

### New Capabilities
<!-- None — this change extends documentation requirements on an existing capability. -->

### Modified Capabilities
- `pr-preview-auth-handoff`: Add a documentation requirement covering
  the consumer-side configuration prerequisite (consumer backend's
  `apiOrigin` must equal the service's public origin), parallel to the
  existing previewbase-side `ALLOWED_PREVIEW_ORIGIN_REGEX` documentation
  requirement. Also disambiguates which "do not set `API_URL`" guidance
  applies to which surface (frontend build vs. backend service).

## Impact

- `PREVIEW_DEPLOYMENT.md` — consumer-config section grows a one-line
  requirement; the "Recommended" block grows a frontend-vs-backend scope
  qualifier.
- `docs/auth/oidc-login-flow.md` — consumer per-environment configuration
  section gains the same caveat for symmetry.
- No code, schema, frontend, extension, or CLI changes. No test changes
  beyond what the spec delta dictates (a documentation-presence check is
  sufficient and matches the existing precedent for the previewbase
  documentation requirement).
