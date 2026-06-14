# Tasks

## 1. Shared auth helper

- [x] 1.1 Add `analyser/auth.py` with `get_api_key()` returning
  `FOMOPLAYER_API_KEY` if set, else the `apiKey` from the CLI config file
  (`$XDG_CONFIG_HOME/fomoplayer/config.json` or `~/.config/fomoplayer/config.json`).
- [x] 1.2 Raise a clear, actionable error when no key is found (instruct
  `fomoplayer login` or setting `FOMOPLAYER_API_KEY`).
- [x] 1.3 Add an auth-header helper (`{"Authorization": f"Bearer {get_api_key()}"}`).
- [x] 1.4 Add `get_api_url()` reading `FOMOPLAYER_API_URL` (error if unset).

## 2. Switch workers to API-key auth

- [x] 2.1 `main.py`: replace `get_oauth2_token()` usage with the auth-header
  helper; remove OIDC client/provider setup and token handling.
- [x] 2.2 `panako_processor.py`: same replacement; remove its OIDC token code.
- [x] 2.3 `waveform.py`: same replacement; remove its OIDC token code and the
  hardcoded `https://fomoplayer.com/api/...` URL, using `get_api_url()` instead.
- [x] 2.4 Replace all `API_URL` references with `FOMOPLAYER_API_URL` via
  `get_api_url()`.
- [x] 2.5 On `403` responses, surface the `ADMIN_USER_SUBS` prerequisite in the
  error message.

## 3. Remove OIDC artifacts

- [x] 3.1 Delete `analyser/oidc_common.py`.
- [x] 3.2 Delete `analyser/LoopbackServer.py`.
- [x] 3.3 Delete `analyser/oidc_configuration.json`.
- [x] 3.4 Remove `./.fomo_player_token` reads/writes and any leftover imports.
- [x] 3.5 Remove `GOOGLE_NATIVE_APP_OIDC_CLIENT_ID` /
  `GOOGLE_NATIVE_APP_OIDC_CLIENT_SECRET` from code and the `.env` template.

## 4. Docs and config

- [x] 4.1 Update `analyser/README.md`: document minting a key via
  `fomoplayer login` / `fomoplayer keys`, `FOMOPLAYER_API_KEY`,
  `FOMOPLAYER_API_URL`, the admin-subject prerequisite, and rate-limit guidance.
- [x] 4.2 Update the analyser `.env` template to the new variables.
- [x] 4.3 Update `analyse.sh` / run docs if they reference OIDC env vars.
  (`analyse.sh` references no OIDC env vars — no change needed.)

## 5. Verification

- [ ] 5.1 Run a worker against a real backend with a valid admin API key and
  confirm a batch fetch + upload succeeds (embeddings, fingerprints, waveform).
  (Operator step — needs a running backend + real admin key; not runnable here.)
- [x] 5.2 Confirm a missing key fails fast with the actionable error.
- [ ] 5.3 Confirm a non-admin key produces the `403`/`ADMIN_USER_SUBS` message.
  (Message-construction logic verified via unit check; live 403 against a real
  non-admin key is an operator step.)
- [x] 5.4 Grep the analyser tree for `oidc`, `fomo_player_token`,
  `GOOGLE_NATIVE_APP`, and `API_URL` to confirm no stragglers remain.
