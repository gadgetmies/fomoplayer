## MODIFIED Requirements

### Requirement: Documented previewbase configuration

`PREVIEW_DEPLOYMENT.md` MUST document both halves of the handoff
deployment contract:

1. On the **previewbase (authority)** side,
   `ALLOWED_PREVIEW_ORIGIN_REGEX` is the env var that gates which
   handoff target origins the previewbase will accept, including a
   one-line explanation of what breaks if it is empty.

2. On the **PR-preview (consumer)** side, the backend's `apiOrigin`
   MUST equal the service's public origin. The handoff token's
   audience is bound to the consumer's public origin at mint and
   verified against `config.apiOrigin` at the consumer's
   `/login/google/handoff`; if these don't match, every otherwise-valid
   token is rejected silently. The practical implication —
   `API_URL` (or `IP`+`PORT`) on the **backend service** must resolve
   to the consumer's public origin — MUST be stated explicitly.

The existing "Recommended (same domain, path-based routing)" block in
`PREVIEW_DEPLOYMENT.md` MUST scope its "do not set `API_URL`" guidance
explicitly to the **frontend build**, so a reader cannot mistake it for
guidance about the backend service's environment.

`docs/auth/oidc-login-flow.md` MUST surface the same consumer-side
caveat (`apiOrigin == public origin`) in the consumer per-environment
configuration section, so a reader looking at the auth flow doc alone
also encounters the prerequisite.

#### Scenario: Required previewbase env var is documented

- **WHEN** a developer reads `PREVIEW_DEPLOYMENT.md`
- **THEN** they find `ALLOWED_PREVIEW_ORIGIN_REGEX` listed under
  previewbase configuration, with the consequence of leaving it empty
  ("every handoff target is rejected with
  `subReason: allowlist-not-configured`") and an example regex shape
  for Railway-hosted PR previews

#### Scenario: Consumer apiOrigin requirement is documented

- **WHEN** a developer reads `PREVIEW_DEPLOYMENT.md`'s "PR-preview
  consumer configuration (handoff target)" section
- **THEN** they find an explicit requirement that the backend's
  `apiOrigin` must equal the service's public origin, with the
  practical implication named (`API_URL` or `IP`+`PORT` on the backend
  service must resolve to that origin) and the failure mode named
  (handoff token audience check rejects every token, user lands on
  `?loginFailed=true`)

#### Scenario: Frontend-vs-backend "do not set API_URL" guidance is unambiguous

- **WHEN** a developer reads the "Recommended (same domain, path-based
  routing)" block in `PREVIEW_DEPLOYMENT.md`
- **THEN** the "do not set `API_URL`" guidance is explicitly scoped to
  the **frontend build**, with a sentence or callout making clear that
  it does not apply to the backend service

#### Scenario: Auth-flow doc surfaces the consumer prerequisite

- **WHEN** a developer reads `docs/auth/oidc-login-flow.md`'s consumer
  per-environment configuration section
- **THEN** they find the same `apiOrigin == public origin` prerequisite
  named, so the auth-flow doc alone is sufficient to avoid the
  misconfiguration
