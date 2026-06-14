## Why

The analyser authenticates to the Fomo Player backend with a bespoke Google
OIDC Authorization-Code-+-PKCE flow (`analyser/oidc_common.py`,
`analyser/LoopbackServer.py`): it spins up a local loopback HTTP server, opens a
browser to Google's consent screen, exchanges the code with Google, caches
`id_token`/`refresh_token` in `./.fomo_player_token`, and sends
`Authorization: Bearer <id_token>` to `/api/admin/*`. This needs a Google
native-app client id/secret, depends on an interactive browser (awkward for a
headless batch worker), and duplicates ~150 lines of auth machinery. The
`fomoplayer` CLI already solves machine auth with long-lived API keys
(`Bearer fp_<id>`), and the backend already accepts those keys for `/admin/*`
(the admin gate is a pure OIDC-subject allowlist, with no Google/JWT-issuer
check) — so switching the analyser to API-key auth is a drop-in with no backend
changes.

## What Changes

- Authenticate every analyser request with a Fomo Player API key
  (`Authorization: Bearer fp_...`), replacing `get_oauth2_token()` in
  `main.py`, `panako_processor.py`, and `waveform.py`.
- Add a single shared auth helper resolving the key from
  `FOMOPLAYER_API_KEY`, falling back to the CLI config
  (`~/.config/fomoplayer/config.json`, honoring `$XDG_CONFIG_HOME`); fail fast
  with an actionable message when no key is found.
- Standardize the backend base URL on `FOMOPLAYER_API_URL` (the CLI's
  variable), and remove the hardcoded `https://fomoplayer.com/api/...` URL in
  `waveform.py` per the `CLAUDE.md` configuration policy.
- **BREAKING** (operational): remove `analyser/oidc_common.py`,
  `analyser/LoopbackServer.py`, `analyser/oidc_configuration.json`, the
  `./.fomo_player_token` cache, and the `GOOGLE_NATIVE_APP_OIDC_CLIENT_ID` /
  `GOOGLE_NATIVE_APP_OIDC_CLIENT_SECRET` env vars. Operators must instead
  provide an API key minted on an admin account.
- Update analyser docs (`README.md`, `.env` template, `analyse.sh`) to describe
  `fomoplayer login` / `fomoplayer keys` setup and the admin-subject + rate-limit
  prerequisites.

## Capabilities

### New Capabilities
- `analyser-authentication`: how the analyser authenticates to the Fomo Player
  backend — API-key credential, key/URL configuration resolution, error
  behavior, and the absence of any OIDC login flow.

### Modified Capabilities
<!-- None: no existing spec's requirements change; the backend admin
     authorization model is unchanged. -->

## Impact

- Affected code: `analyser/main.py`, `analyser/panako_processor.py`,
  `analyser/waveform.py`; deletions of `analyser/oidc_common.py`,
  `analyser/LoopbackServer.py`, `analyser/oidc_configuration.json`; docs in
  `analyser/README.md` and the analyser `.env` template.
- Affected behavior: **only** how the analyser authenticates. Endpoints,
  request payloads, and the `Bearer` header shape are unchanged.
- Operational prerequisites: the API key's account must have an OIDC subject in
  the backend's `ADMIN_USER_SUBS` (else `/admin/*` returns `403`); the key's
  rate limits must suit the analyser's batch loops.
- No backend changes: `fp_` keys are already accepted at `/api` and the admin
  gate is subject-based.
