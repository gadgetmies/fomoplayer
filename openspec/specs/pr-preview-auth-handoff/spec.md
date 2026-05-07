# PR-preview auth handoff

## Purpose

Cross-origin Google OIDC login handoff between PR-preview *consumer*
backends and the previewbase *authority*. PR-preview deployments cannot
each register their own OIDC redirect URI, so the previewbase runs the
OIDC round trip on their behalf, mints a single-use handoff token bound
to the consumer's origin, and redirects the browser to a consumer
endpoint that exchanges the token for a local session. This capability
covers the consumer-side delegation, the authority-side state handling
and target allowlisting, the token issuance and consumption contract,
the structured failure logging, and the operator-facing configuration
that gates which consumer origins are accepted.
## Requirements
### Requirement: Consumer delegates `/login/google` to the authority with `handoffTarget`

When a backend is configured as a handoff *consumer* (`oidcHandoffUrl`,
`oidcHandoffAuthorityOrigin`, and `oidcHandoffSecret` are all set, and
`oidcHandoffAuthorityOrigin !== apiOrigin`), `GET /api/auth/login/google`
MUST redirect the browser to the authority's
`/api/auth/login/google` URL, forwarding `returnPath` and adding
`handoffTarget` set to the consumer's request origin
(`getRequestOrigin(req)`).

#### Scenario: Consumer redirects to authority with handoff target

- **WHEN** a request arrives at `GET /api/auth/login/google?returnPath=%2F`
  on a consumer backend whose `apiOrigin` differs from
  `oidcHandoffAuthorityOrigin`
- **THEN** the response is a 302 to
  `<oidcHandoffUrl>?returnPath=%2F&handoffTarget=<consumer-origin>`

#### Scenario: Self-referential authority does not delegate

- **WHEN** the same request arrives on a backend where
  `oidcHandoffAuthorityOrigin === apiOrigin`
- **THEN** the consumer-delegation branch MUST NOT run; the request proceeds
  to the local `passport.authenticate('openidconnect', ...)` flow

### Requirement: Authority preserves `handoffTarget` across the OIDC round trip

When `GET /api/auth/login/google` arrives on the authority with a
`handoffTarget` query parameter, the authority MUST verify the target with
the configured allowlist and, if accepted, propagate it through the OIDC
round trip such that it is recoverable on `/api/auth/login/google/return`
without depending on `req.session` surviving the round trip.

The authority MUST configure the underlying `passport-openidconnect`
strategy with a state store whose `store(req, ctx, appState, meta, cb)` /
`verify(req, handle, cb)` implementation does not read or write
`req.session`. The default `SessionStateStore` is replaced by
`StatelessStateStore` (signs `{ ctx, appState }` as a JWT keyed on
`config.sessionSecret`, `aud=oidc-state`, 10 min TTL, used as the OIDC
`state` query parameter directly).

#### Scenario: Safe handoffTarget is accepted and preserved

- **WHEN** the authority receives
  `/login/google?returnPath=%2F&handoffTarget=https://<safe-pr-preview>`
- **THEN** the authority initiates the OIDC flow with a `state` value that,
  on return, yields
  `{ returnPath: '/', handoffTarget: 'https://<safe-pr-preview>' }`
  with `req.session` empty across the round trip

#### Scenario: State delivery does not depend on req.session

- **WHEN** the authority's `/login/google/return` is invoked with a valid
  state JWT and `req.session = {}`
- **THEN** `passport.authenticate` does not produce a "Unable to verify
  authorization request state." failure and the handoff branch executes
  normally

#### Scenario: Unsafe handoffTarget is rejected before OIDC

- **WHEN** the authority receives a `handoffTarget` for which
  `evaluateHandoffTarget` returns `{ ok: false }`
- **THEN** the authority redirects to `${frontendURL}/?loginFailed=true` and
  emits a structured warning log identifying the rejection

### Requirement: Authority `/login/google/return` MUST take the handoff branch when `handoffTarget` is set

On the OIDC return, when the resolved state contains a non-empty
`handoffTarget`, the authority MUST mint a handoff token and redirect to the
consumer's `/api/auth/login/google/handoff` endpoint. The authority MUST NOT
call `req.login` to establish a local session for the user, regardless of any
pre-existing session on the authority for the same user.

#### Scenario: Cold-start handoff happy path

- **WHEN** the authority's `/login/google/return` is invoked with no
  pre-existing session and the resolved state contains a valid
  `handoffTarget` and a fresh OIDC user with `oidcIdentity`
- **THEN** the response is a 302 to
  `<handoffTarget>/api/auth/login/google/handoff?token=<minted>&returnPath=<encoded>`
- **AND** `req.login` is NOT called on the authority

#### Scenario: Existing-authority-session handoff happy path

- **WHEN** the authority's `/login/google/return` is invoked while the
  authority already has a logged-in session for the same user, and the
  resolved state contains a valid `handoffTarget`
- **THEN** the response is a 302 to the consumer's handoff URL just as in
  the cold-start case
- **AND** the authority's existing session is unaffected; no new
  authority-side login is performed for the consumer flow

### Requirement: Authority emits a stable `reason` string for each handoff failure

Every `redirectWithLoginFailed` invoked from the handoff branch on
`/login/google/return` (and `/login/google` pre-OIDC rejection) MUST be
accompanied by a structured `logger.warn` call that includes a `reason`
field drawn from a stable enumeration:
`handoff-target-unsafe`, `handoff-mint-failed`, `oidc-identity-missing`.
When `reason` is `handoff-target-unsafe`, the log MUST also include a
`subReason` of `allowlist-not-configured`, `origin-not-allowed`, or
`missing-or-invalid-url`.

#### Scenario: Empty allowlist is logged as allowlist-not-configured

- **WHEN** `evaluateHandoffTarget` rejects a target because
  `config.handoffTargetOriginRegexes` is empty
- **THEN** a `logger.warn` fires with
  `reason: 'handoff-target-unsafe'` and `subReason: 'allowlist-not-configured'`

#### Scenario: Origin mismatch is logged as origin-not-allowed

- **WHEN** `evaluateHandoffTarget` rejects a target because the origin
  doesn't match any configured regex
- **THEN** a `logger.warn` fires with
  `reason: 'handoff-target-unsafe'` and `subReason: 'origin-not-allowed'`

#### Scenario: Mint failure is logged as handoff-mint-failed

- **WHEN** `mintHandoffTokenFn` throws inside the handoff branch
- **THEN** a `logger.warn` (or `logger.error`) fires with
  `reason: 'handoff-mint-failed'` including the error message

#### Scenario: Missing OIDC identity is logged as oidc-identity-missing

- **WHEN** the authenticated user lacks `oidcIdentity.issuer` or
  `oidcIdentity.subject` at the handoff branch
- **THEN** a `logger.warn` fires with `reason: 'oidc-identity-missing'`

### Requirement: Consumer `/login/google/handoff` consumes the token and establishes a local session

When the consumer receives `GET /api/auth/login/google/handoff?token=...`,
it MUST verify the token signature, audience (`apiOrigin`), issuer
(`oidcHandoffAuthorityOrigin`), and `jti` single-use property, then look up
or create the account and call `req.login` to establish the consumer-side
session. After login, it MUST redirect to `returnPath` if it is a safe
relative path on the consumer's frontend.

#### Scenario: Valid token logs the user in on the consumer

- **WHEN** the consumer receives a valid handoff token whose payload's
  `oidcIssuer` and `sub` resolve to an existing account
- **THEN** the consumer establishes a session for that user and redirects
  to `<frontendURL><returnPath>`

#### Scenario: Replayed token is rejected

- **WHEN** the same valid handoff token is presented twice
- **THEN** the second request 302s to `${frontendURL}/?loginFailed=true`
  and a warning log records `Handoff token replay rejected`

### Requirement: Authority-side startup warning when handoff allowlist is empty

When a backend boots with the handoff *issuer* role configured
(`canMintHandoff = true`) but `config.handoffTargetOriginRegexes` is
empty, the backend MUST emit one `logger.warn` at startup naming the
consequence (handoff requests will be rejected with
`reason: handoff-target-unsafe / subReason: allowlist-not-configured`).
Startup MUST NOT abort.

#### Scenario: Authority startup warns when allowlist is empty

- **WHEN** the previewbase boots with handoff issuer config but
  `ALLOWED_PREVIEW_ORIGIN_REGEX` is empty
- **THEN** a single `logger.warn` mentioning
  `ALLOWED_PREVIEW_ORIGIN_REGEX` is emitted at startup, and the server
  continues listening

#### Scenario: Authority startup is silent when allowlist is configured

- **WHEN** the previewbase boots with at least one regex in
  `config.handoffTargetOriginRegexes`
- **THEN** no startup warning about the allowlist is emitted

#### Scenario: Authority startup is silent when handoff issuer is not enabled

- **WHEN** the previewbase boots without `OIDC_HANDOFF_SECRET` set
  (`canMintHandoff = false`), regardless of whether the allowlist is
  configured
- **THEN** no startup warning about the allowlist is emitted

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

