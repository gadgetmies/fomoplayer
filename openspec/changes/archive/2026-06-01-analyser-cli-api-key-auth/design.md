# Design

## Context

The analyser is a set of Python batch workers (`main.py` for embeddings,
`panako_processor.py` for fingerprints, `waveform.py` for waveforms, driven by
`analyse.sh`). Each independently obtains a Google OIDC `id_token` via
`get_oauth2_token()` (PKCE + loopback browser flow in `oidc_common.py` /
`LoopbackServer.py`), caches it in `./.fomo_player_token`, and attaches it as a
bearer token on calls to `/api/admin/*`.

Backend facts that make API-key auth a drop-in (verified during exploration):

- `packages/back/index.js` `/api` middleware: a request whose `Authorization`
  header starts with `Bearer fp_` is authenticated via the `api-key` passport
  strategy; `req.user` is populated from `account.findByUserId`, which includes
  the account's `oidcSubjects`.
- `packages/back/routes/admin/api.js` applies `router.use(ensureIsAdmin)`.
- `ensureIsAdmin` (`packages/back/routes/shared/auth.js`) grants access when any
  of `req.user.oidcSubjects` is in `ADMIN_USER_SUBS`. There is **no** check that
  the credential is a Google token or an active OIDC session.

So an `fp_` key whose owning account has an admin OIDC subject authenticates
against `/admin/*` identically to today's `id_token`.

## Goals / Non-Goals

Goals:
- Remove the OIDC/browser/loopback machinery from the analyser.
- Authenticate every analyser request with a Fomo Player API key.
- Share one auth helper across all analyser entry points.
- Keep all endpoints, payloads, and request shapes unchanged.

Non-Goals:
- No changes to the backend, the CLI, or the admin authorization model.
- Not adding analyser-specific commands to the `fomoplayer` CLI binary (that
  was interpretation "B" and is out of scope).
- No change to what data the analyser fetches or uploads.

## Decisions

### Decision: Reuse the CLI's API-key model, not the CLI binary
The analyser keeps making direct HTTP calls (it is Python and handles large
JSON / binary audio payloads), but uses the CLI's credential type. The CLI
binary has no admin/analyser commands, so shelling out to it is not viable.

### Decision: Key resolution = env var first, CLI config file fallback
Read `FOMOPLAYER_API_KEY` from the environment; if unset, read the `apiKey`
field from the CLI config at `~/.config/fomoplayer/config.json` (honoring
`$XDG_CONFIG_HOME`, matching the `conf` package the CLI uses). This lets an
operator either export a key (CI / container) or just run `fomoplayer login`
once on the host. If neither yields a key, raise a clear error instructing the
user to run `fomoplayer login` or set `FOMOPLAYER_API_KEY`.

### Decision: Single shared auth helper
Add one module (e.g. `analyser/auth.py`) exposing `get_api_key()`,
`get_api_url()`, and an auth-header helper
(`{"Authorization": f"Bearer {key}"}`). All three workers import it, replacing
their copies of token logic.

### Decision: Use `FOMOPLAYER_API_URL` for the base URL
Standardize the analyser on `FOMOPLAYER_API_URL` (the CLI's variable) instead of
`API_URL`, and remove the hardcoded `https://fomoplayer.com/api/...` URL in
`waveform.py`, per the `CLAUDE.md` configuration policy.

### Decision: No automatic token refresh
API keys are long-lived, so the refresh/expiry caching (`./.fomo_player_token`,
`expires_in`, `refresh_token`) is deleted outright rather than ported.

## Risks / Trade-offs

- **Admin subject prerequisite.** If the key's account lacks an admin OIDC
  subject in `ADMIN_USER_SUBS`, every `/admin/*` call returns `403`. Mitigation:
  document this and surface the backend's `403 {error:'Access denied'}` body in
  the analyser's error message so the cause is obvious.
- **Rate limits.** `fp_` keys carry per-minute/per-day limits; the analyser's
  tight batch loops could trip them. Mitigation: mint the analyser key with
  adequate limits; document it.
- **Long-lived credential.** An API key is a standing secret. Mitigation: keep
  it in env/CLI config (never committed); it can be revoked via `fomoplayer keys`.

## Migration

1. On an admin account, run `fomoplayer login` (and optionally `fomoplayer keys`
   to mint a dedicated higher-limit key for the analyser).
2. Provide the key to the analyser via `FOMOPLAYER_API_KEY` or the host's CLI
   config file; set `FOMOPLAYER_API_URL`.
3. Deploy the updated analyser. The old `./.fomo_player_token`,
   `oidc_configuration.json`, and Google client env vars become unused and are
   removed.
