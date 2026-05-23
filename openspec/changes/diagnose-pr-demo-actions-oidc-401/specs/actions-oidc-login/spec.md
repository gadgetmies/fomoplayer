## ADDED Requirements

### Requirement: Actions OIDC verifier MUST emit a structured `reason` warn on every rejection

`verifyActionsToken` MUST emit exactly one `logger.warn` per rejection
path when a `logger` is supplied, with a `reason` field drawn from the
closed enumeration `verifier-input-missing`, `jwks-key-fetch-failed`,
`signature-or-claim-verification-failed`, or `repository-claim-mismatch`.
The log MUST include `expectedAudience`, `expectedRepo`, and
`issuer = 'https://token.actions.githubusercontent.com'` so the operator
can compare expected against observed values without consulting the
calling code. When `logger` is omitted or its `.warn` is not a function,
the verifier MUST NOT throw and MUST preserve today's silent-rejection
behaviour.

#### Scenario: Missing input is logged as verifier-input-missing

- **WHEN** `verifyActionsToken` is called with `token`, `audience`, or
  `allowedRepo` falsy and a logger is supplied
- **THEN** the verifier resolves `null` and `logger.warn` is called
  exactly once with `reason: 'verifier-input-missing'` and a
  `missing` array enumerating which inputs were absent

#### Scenario: JWKS signing-key lookup failure is logged as jwks-key-fetch-failed

- **WHEN** the JWKS client errors before signature verification (e.g.
  network failure, unknown `kid`)
- **THEN** the verifier resolves `null` and `logger.warn` is called
  exactly once with `reason: 'jwks-key-fetch-failed'`, the `kid` from
  the unverified header (or `null` if absent), and the underlying
  error name and message

#### Scenario: Signature or claim mismatch is logged with unverified claims

- **WHEN** `jwt.verify` rejects the token (signature, audience,
  issuer, algorithm, or expiry failure)
- **THEN** the verifier resolves `null` and `logger.warn` is called
  exactly once with `reason: 'signature-or-claim-verification-failed'`,
  the `jsonwebtoken` error `name` and `message`, and an
  `unverifiedClaims` object containing the token's decoded `iss`,
  `aud`, `sub`, `repository`, `exp`, and unverified header `alg`

#### Scenario: Repository claim mismatch is logged after signature verification

- **WHEN** `jwt.verify` accepts the token but `payload.repository !==
  allowedRepo`
- **THEN** the verifier resolves `null` and `logger.warn` is called
  exactly once with `reason: 'repository-claim-mismatch'`, the
  observed `repository` value, and the configured `expectedRepo`

#### Scenario: No logger supplied means silent rejection

- **WHEN** `verifyActionsToken` is called without a `logger`, or with a
  `logger` whose `warn` property is not a function, and verification
  fails
- **THEN** the verifier resolves `null` and no exception is thrown

### Requirement: `/api/auth/login/actions` MUST pass its logger into `verifyActionsTokenFn`

`POST /api/auth/login/actions` MUST invoke `verifyActionsTokenFn` with the request's logger and MUST NOT emit a separate opaque "invalid or unauthorized token" warn at the route level, so the verifier's structured warn is the single source of truth for rejection diagnostics.

#### Scenario: Rejection from the verifier produces exactly the verifier's structured warn

- **WHEN** `verifyActionsTokenFn` resolves `null` for a request to
  `POST /api/auth/login/actions`
- **THEN** the route responds with HTTP 401 and the *only* `warn`
  attributable to this request comes from the verifier's structured
  log (i.e. no `warn` containing the literal string `'invalid or
  unauthorized token'` is emitted by the route)

#### Scenario: Logger is threaded into the verifier on every request

- **WHEN** a request arrives at `POST /api/auth/login/actions` with a
  body containing `{ token: '...' }`
- **THEN** `verifyActionsTokenFn` is invoked with a `logger` argument
  whose `.warn` is a function (the same logger used elsewhere by the
  route)
