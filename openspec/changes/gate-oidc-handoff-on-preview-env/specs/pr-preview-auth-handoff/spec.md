## ADDED Requirements

### Requirement: Handoff configuration is dormant when `PREVIEW_ENV` is unset

The backend MUST treat all handoff-related configuration values exported
from `packages/back/config.js` as off when `PREVIEW_ENV` is unset or
empty, regardless of whether the underlying env vars
(`OIDC_HANDOFF_SECRET`, `AUTH_API_URL`, `ALLOWED_PREVIEW_ORIGIN_REGEX`)
are set: `oidcHandoffSecret`, `oidcHandoffUrl`, and
`oidcHandoffAuthorityOrigin` MUST be `undefined`, and
`allowedPreviewOriginRegexes` MUST be an empty array.
`validateAuthConfig` MUST NOT throw the
"looks-like-handoff-consumer-but-no-secret" or
"handoff-issuer-enabled-but-no-allowlist" errors when `PREVIEW_ENV` is
unset, even if the underlying env vars would otherwise trigger them;
the backend MUST start.

#### Scenario: Local dev with backend on a different port from frontend boots cleanly

- **GIVEN** `PREVIEW_ENV` is unset
- **AND** `AUTH_API_URL` defaults to `${frontendURL}/api`
- **AND** the backend's `apiURL` resolves to a different origin than
  `frontendURL` (e.g. backend on port 4000, frontend on port 3000)
- **AND** `OIDC_HANDOFF_SECRET` is unset
- **WHEN** `packages/back/config.js` is loaded
- **THEN** the module loads without throwing
- **AND** the exported `oidcHandoffSecret` / `oidcHandoffUrl` /
  `oidcHandoffAuthorityOrigin` are all `undefined`
- **AND** the exported `allowedPreviewOriginRegexes` is `[]`

#### Scenario: Stale handoff env vars in local shell are ignored when `PREVIEW_ENV` is unset

- **GIVEN** `PREVIEW_ENV` is unset
- **AND** `OIDC_HANDOFF_SECRET` is set in the shell environment (e.g.
  leaked from a previous deploy-config session)
- **AND** `ALLOWED_PREVIEW_ORIGIN_REGEX` is set
- **WHEN** the backend starts
- **THEN** the exported `oidcHandoffSecret` is `undefined`
- **AND** the exported `allowedPreviewOriginRegexes` is `[]`
- **AND** the validator does not throw the "issuer enabled but
  allowlist empty" error

#### Scenario: Setting `PREVIEW_ENV=true` locally re-enables handoff configuration

- **GIVEN** a developer wants to test handoff against a remote
  authority from their local backend
- **WHEN** they set `PREVIEW_ENV=true` together with
  `OIDC_HANDOFF_SECRET`, `AUTH_API_URL`, and (if acting as authority)
  `ALLOWED_PREVIEW_ORIGIN_REGEX`
- **THEN** `packages/back/config.js` exports the populated handoff
  values
- **AND** `validateAuthConfig` enforces the same consistency checks
  it does in production preview environments

## MODIFIED Requirements

### Requirement: Consumer delegates `/login/google` to the authority with `handoffTarget`

`GET /api/auth/login/google` MUST redirect the browser to the
authority's `/api/auth/login/google` URL when the backend boots with
`PREVIEW_ENV=true` AND is configured as a handoff *consumer*
(`oidcHandoffUrl`, `oidcHandoffAuthorityOrigin`, and
`oidcHandoffSecret` are all set, and
`oidcHandoffAuthorityOrigin !== apiOrigin`), forwarding `returnPath`
and adding `handoffTarget` set to the consumer's request origin
(`getRequestOrigin(req)`). When `PREVIEW_ENV` is unset the
consumer-delegation branch MUST NOT run regardless of the other env
vars, because all handoff-related config values are forced to
`undefined` upstream (see the "Handoff configuration is dormant when
`PREVIEW_ENV` is unset" requirement).

#### Scenario: Consumer redirects to authority with handoff target

- **GIVEN** `PREVIEW_ENV=true`
- **AND** the backend is configured as a handoff consumer
- **WHEN** a request arrives at `GET /api/auth/login/google?returnPath=%2F`
  on a consumer backend whose `apiOrigin` differs from
  `oidcHandoffAuthorityOrigin`
- **THEN** the response is a 302 to
  `<oidcHandoffUrl>?returnPath=%2F&handoffTarget=<consumer-origin>`

#### Scenario: Self-referential authority does not delegate

- **GIVEN** `PREVIEW_ENV=true`
- **WHEN** the same request arrives on a backend where
  `oidcHandoffAuthorityOrigin === apiOrigin`
- **THEN** the consumer-delegation branch MUST NOT run; the request proceeds
  to the local `passport.authenticate('openidconnect', ...)` flow

#### Scenario: Local dev with `PREVIEW_ENV` unset never delegates

- **GIVEN** `PREVIEW_ENV` is unset
- **AND** environment variables that *would* otherwise configure a
  consumer (`AUTH_API_URL`, `OIDC_HANDOFF_SECRET`) are set
- **WHEN** a request arrives at `GET /api/auth/login/google`
- **THEN** the consumer-delegation branch MUST NOT run; the request
  proceeds to the local OIDC flow

### Requirement: Authority preserves `handoffTarget` across the OIDC round trip

The authority MUST verify a `handoffTarget` query parameter against
the configured allowlist and propagate it through the OIDC round trip
when the backend boots with `PREVIEW_ENV=true` and `GET /api/auth/login/google`
arrives with `handoffTarget` set, such that the value is recoverable
on `/api/auth/login/google/return` without depending on `req.session`
surviving the round trip. The authority MUST configure the underlying
`passport-openidconnect` strategy with a state store whose
`store(req, ctx, appState, meta, cb)` / `verify(req, handle, cb)`
implementation does not read or write `req.session` (the default
`SessionStateStore` is replaced by `StatelessStateStore`, which signs
`{ ctx, appState }` as a JWT keyed on `config.sessionSecret`,
`aud=oidc-state`, 10 min TTL, used as the OIDC `state` query parameter
directly). When `PREVIEW_ENV` is unset, the handoff branch on the
authority MUST NOT run regardless of any `handoffTarget` query
parameter, because all handoff-related config values are forced to
`undefined` upstream.

#### Scenario: Safe handoffTarget is accepted and preserved

- **GIVEN** `PREVIEW_ENV=true` and the authority is configured with
  `OIDC_HANDOFF_SECRET` and a non-empty
  `ALLOWED_PREVIEW_ORIGIN_REGEX`
- **WHEN** the authority receives
  `/login/google?returnPath=%2F&handoffTarget=https://<safe-pr-preview>`
- **THEN** the authority initiates the OIDC flow with a `state` value that,
  on return, yields
  `{ returnPath: '/', handoffTarget: 'https://<safe-pr-preview>' }`
  with `req.session` empty across the round trip

#### Scenario: State delivery does not depend on req.session

- **GIVEN** `PREVIEW_ENV=true`
- **WHEN** the authority's `/login/google/return` is invoked with a valid
  state JWT and `req.session = {}`
- **THEN** `passport.authenticate` does not produce a "Unable to verify
  authorization request state." failure and the handoff branch executes
  normally

#### Scenario: Unsafe handoffTarget is rejected before OIDC

- **GIVEN** `PREVIEW_ENV=true`
- **WHEN** the authority receives a `handoffTarget` for which
  `evaluateHandoffTarget` returns `{ ok: false }`
- **THEN** the authority redirects to `${frontendURL}/?loginFailed=true` and
  emits a structured warning log identifying the rejection

### Requirement: Authority `/login/google/return` MUST take the handoff branch when `handoffTarget` is set

The authority MUST mint a handoff token and redirect to the consumer's
`/api/auth/login/google/handoff` endpoint when, on the OIDC return,
the resolved state contains a non-empty `handoffTarget` AND
`PREVIEW_ENV=true`. The authority MUST NOT call `req.login` to
establish a local session for the user, regardless of any pre-existing
session on the authority for the same user. When `PREVIEW_ENV` is
unset, the handoff branch MUST NOT run because `canMintHandoff`
evaluates to `false` (`oidcHandoffSecret` is forced to `undefined`).

#### Scenario: Cold-start handoff happy path

- **GIVEN** `PREVIEW_ENV=true` and the authority is configured to mint
  handoff tokens
- **WHEN** the authority's `/login/google/return` is invoked with no
  pre-existing session and the resolved state contains a valid
  `handoffTarget` and a fresh OIDC user with `oidcIdentity`
- **THEN** the response is a 302 to
  `<handoffTarget>/api/auth/login/google/handoff?token=<minted>&returnPath=<encoded>`
- **AND** `req.login` is NOT called on the authority

#### Scenario: Existing-authority-session handoff happy path

- **GIVEN** `PREVIEW_ENV=true`
- **WHEN** the authority's `/login/google/return` is invoked while the
  authority already has a logged-in session for the same user, and the
  resolved state contains a valid `handoffTarget`
- **THEN** the response is a 302 to the consumer's handoff URL just as in
  the cold-start case
- **AND** the authority's existing session is unaffected; no new
  authority-side login is performed for the consumer flow

### Requirement: Authority-side startup warning when handoff allowlist is empty

The backend MUST emit one `logger.warn` at startup naming the
consequence (handoff requests will be rejected with
`reason: handoff-target-unsafe / subReason: allowlist-not-configured`)
when it boots with `PREVIEW_ENV=true` AND the handoff *issuer* role
configured (`canMintHandoff = true`) but
`config.handoffTargetOriginRegexes` (the runtime-resolved equivalent
of `allowedPreviewOriginRegexes`) is empty. Startup MUST NOT abort.
When `PREVIEW_ENV` is unset, no such warning is emitted because
`canMintHandoff` evaluates to `false`.

#### Scenario: Authority startup warns when allowlist is empty

- **GIVEN** `PREVIEW_ENV=true`
- **WHEN** the previewbase boots with handoff issuer config but
  `ALLOWED_PREVIEW_ORIGIN_REGEX` is empty
- **THEN** a single `logger.warn` mentioning
  `ALLOWED_PREVIEW_ORIGIN_REGEX` is emitted at startup, and the server
  continues listening

#### Scenario: Authority startup is silent when allowlist is configured

- **GIVEN** `PREVIEW_ENV=true`
- **WHEN** the previewbase boots with at least one regex in
  `config.handoffTargetOriginRegexes`
- **THEN** no startup warning about the allowlist is emitted

#### Scenario: Authority startup is silent when handoff issuer is not enabled

- **WHEN** the previewbase boots without `OIDC_HANDOFF_SECRET` set
  (`canMintHandoff = false`), regardless of whether the allowlist is
  configured or whether `PREVIEW_ENV` is set
- **THEN** no startup warning about the allowlist is emitted

#### Scenario: Local dev with `PREVIEW_ENV` unset emits no warning

- **GIVEN** `PREVIEW_ENV` is unset
- **AND** `OIDC_HANDOFF_SECRET` is set in the local shell environment
- **WHEN** the backend boots
- **THEN** no startup warning about the allowlist is emitted, because
  `canMintHandoff` evaluates to `false` (the secret was forced to
  `undefined` upstream)
