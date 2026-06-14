# analyser-authentication

## ADDED Requirements

### Requirement: API-key authentication for backend requests

The analyser SHALL authenticate to the Fomo Player backend using a Fomo Player
API key (a `Bearer fp_<id>` token) on every request, and SHALL NOT perform any
Google OIDC login flow.

#### Scenario: Authenticated request carries the API key

- **WHEN** any analyser worker (`main.py`, `panako_processor.py`,
  `waveform.py`) issues an HTTP request to the backend
- **THEN** the request includes an `Authorization: Bearer <api-key>` header
  whose value is the configured Fomo Player API key
- **AND** no Google OIDC `id_token`, refresh token, browser, or loopback server
  is involved

#### Scenario: Admin endpoints accept the API key

- **WHEN** the analyser calls an `/api/admin/*` endpoint with an API key whose
  owning account has an OIDC subject listed in the backend's `ADMIN_USER_SUBS`
- **THEN** the backend authorizes the request exactly as it did for the
  previous `id_token`

#### Scenario: Non-admin key is reported clearly

- **WHEN** the analyser uses an API key whose account is not an admin
- **AND** the backend responds `403 {"error":"Access denied"}`
- **THEN** the analyser surfaces an error explaining that the API key's account
  must have an OIDC subject in `ADMIN_USER_SUBS`

### Requirement: API-key configuration resolution

The analyser SHALL resolve its API key from configuration, preferring an
environment variable and falling back to the `fomoplayer` CLI's stored
credentials.

#### Scenario: Key supplied via environment variable

- **WHEN** `FOMOPLAYER_API_KEY` is set in the environment
- **THEN** the analyser uses that value as its API key

#### Scenario: Key read from CLI config file

- **WHEN** `FOMOPLAYER_API_KEY` is unset
- **AND** a `fomoplayer` CLI config file exists (at
  `~/.config/fomoplayer/config.json`, honoring `$XDG_CONFIG_HOME`) containing an
  `apiKey` value
- **THEN** the analyser uses the `apiKey` from that file

#### Scenario: No key configured

- **WHEN** neither `FOMOPLAYER_API_KEY` nor a CLI config `apiKey` is available
- **THEN** the analyser exits with an actionable error instructing the operator
  to run `fomoplayer login` or set `FOMOPLAYER_API_KEY`
- **AND** does not attempt any backend request

### Requirement: Backend base URL from configuration

The analyser SHALL read the backend base URL from the `FOMOPLAYER_API_URL`
environment variable, with no hardcoded deployment URLs.

#### Scenario: Base URL drives all requests

- **WHEN** the analyser builds any backend request URL
- **THEN** it is derived from `FOMOPLAYER_API_URL`
- **AND** no request targets a literal hostname such as `fomoplayer.com`

#### Scenario: Base URL not configured

- **WHEN** `FOMOPLAYER_API_URL` is unset
- **THEN** the analyser exits with an actionable error and does not attempt any
  backend request

### Requirement: Removal of OIDC machinery

The analyser SHALL NOT contain Google OIDC login code, configuration, or token
caches.

#### Scenario: OIDC artifacts are absent

- **WHEN** the analyser source is inspected after this change
- **THEN** `oidc_common.py`, `LoopbackServer.py`, and `oidc_configuration.json`
  do not exist
- **AND** the analyser neither reads nor writes `./.fomo_player_token`
- **AND** the env vars `GOOGLE_NATIVE_APP_OIDC_CLIENT_ID` and
  `GOOGLE_NATIVE_APP_OIDC_CLIENT_SECRET` are no longer referenced
