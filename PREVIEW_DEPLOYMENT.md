# Preview Deployment Configuration

Use these variables to make dynamic PR preview domains work without per-PR code changes.

## Recommended (same domain, path-based routing)

- Serve frontend and API from the same host, with API under `/api`.
- Do not set `API_URL` for preview/prod frontend builds.
- Frontend will use relative `/api` automatically when no explicit API URL is configured.

## Backend CORS variables

- `FRONTEND_URL`: Primary exact origin allowed by CORS (for non-preview/static domains).
- `ADDITIONAL_ORIGINS`: Comma-separated list of extra exact origins.
- `ALLOWED_ORIGIN_REGEX`: Comma-separated regex list for dynamic preview origins.
  - Example: `^https://pr-[0-9]+\\.preview\\.example\\.com$`

## Frontend/API URL variables

- `API_URL`: Explicit absolute API base URL. Set this for cross-domain deployments.
- `FRONTEND_URL`: Explicit frontend URL used by backend-generated links and auth redirects.

## OIDC / handoff variables (current model)

- `GOOGLE_OIDC_API_REDIRECT`: Callback URI registered in Google OAuth.
  - For production-callback architecture, keep this as production callback URL.
  - For standalone preview debugging, set this to the preview callback URL.
- `INTERNAL_AUTH_HANDOFF_ROLE`: `issuer`, `verifier`, or `both`.
  - Preview default is `verifier` when `PREVIEW_ENV=true`.
- `INTERNAL_AUTH_HANDOFF_ISSUER`: Issuer claim for internal/handoff JWTs.
- `INTERNAL_AUTH_HANDOFF_PRIVATE_KEY`: Required when role includes `issuer`.
- `INTERNAL_AUTH_HANDOFF_PUBLIC_KEY`: Required when role includes `issuer`; used by JWKS endpoint.
- `INTERNAL_AUTH_HANDOFF_JWKS_URL`: Required when role includes `verifier` unless it can be derived from local config.
- `INTERNAL_AUTH_HANDOFF_KID`: Optional key id (`kid`) added to signed JWT headers and exposed in JWKS.
  - Set explicitly in issuer environments for predictable key rotation.
- `INTERNAL_AUTH_API_AUDIENCE`: Audience expected by internal API bearer strategy.
- `PREVIEW_ENV`: Set to `true` for preview deployments.
- `PREVIEW_ALLOWED_GOOGLE_SUBS`: Comma-separated allowlist of Google user IDs (`sub`) allowed in preview exchange.
  - Required when `PREVIEW_ENV=true`; backend startup fails when missing/empty.
- `INTERNAL_AUTH_HANDOFF_SECRET`: Deprecated/ignored in current JWKS-only handoff implementation.

## Standalone preview auth debugging (no production dependency)

Use this when you want to test the full auth flow inside a single preview environment.

### Google setup

- Add the preview callback URL to Google OAuth allowed redirect URIs:
  - `https://<preview-domain>/api/auth/login/google/return`
- Set `GOOGLE_OIDC_API_REDIRECT` to that same URL.

### Required environment variables

- `PREVIEW_ENV=true`
- `PREVIEW_ALLOWED_GOOGLE_SUBS=<your-google-sub>[,<another-sub>]`
- `INTERNAL_AUTH_HANDOFF_ROLE=both`
- `INTERNAL_AUTH_HANDOFF_ISSUER=https://<preview-domain>`
- `INTERNAL_AUTH_HANDOFF_PRIVATE_KEY=<pem-private-key>`
- `INTERNAL_AUTH_HANDOFF_PUBLIC_KEY=<pem-public-key>`
- `INTERNAL_AUTH_HANDOFF_JWKS_URL=https://<preview-domain>/api/auth/.well-known/jwks.json`
- `INTERNAL_AUTH_API_AUDIENCE=https://<preview-domain>/api` (or your chosen fixed audience)

### Generate keys and secrets

Use macOS/Linux shell commands below to generate values safely for preview environments.

- Session and crypto secrets:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # CRYPTO_KEY
```

- RS256 handoff key pair:

```bash
# Private key (PKCS8 PEM)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out handoff-private-preview.pem

# Public key (SPKI PEM)
openssl rsa -pubout -in handoff-private-preview.pem -out handoff-public-preview.pem
```

- Optional key id value:

```bash
date +"preview-%Y%m%d-%H%M%S"   # INTERNAL_AUTH_HANDOFF_KID
```

### Set PEM values with Railway CLI

Run these from the project directory after `railway login` and linking the correct project/environment.

```bash
railway variables set INTERNAL_AUTH_HANDOFF_PRIVATE_KEY="$(cat handoff-private-preview.pem)"
railway variables set INTERNAL_AUTH_HANDOFF_PUBLIC_KEY="$(cat handoff-public-preview.pem)"
```

Optional key id with CLI:

```bash
railway variables set INTERNAL_AUTH_HANDOFF_KID="$(date +"preview-%Y%m%d-%H%M%S")"
```

Do not convert PEM newlines to `\n` unless your runtime explicitly unescapes them.

### Notes

- In this mode, preview acts as both issuer and verifier.
- Keep `PREVIEW_ENV=true` if you want allowlist behavior to remain active during debugging.
- If `PREVIEW_ENV` is removed, allowlist checks are disabled by design.

## INTERNAL_AUTH_HANDOFF_KID guidance

- What it is:
  - `kid` is the key identifier in JWT headers used by verifiers to select the correct public key from JWKS.

- Production (issuer / both role):
  - Set `INTERNAL_AUTH_HANDOFF_KID` explicitly (example: `prod-rs256-2026-04-01-v1`).
  - Keep the same value while using the same keypair.
  - Change it when rotating to a new keypair.

- Preview (verifier-only role):
  - You can omit `INTERNAL_AUTH_HANDOFF_KID` because preview reads `kid` from issuer JWKS.

- Standalone preview debugging (`INTERNAL_AUTH_HANDOFF_ROLE=both`):
  - Set `INTERNAL_AUTH_HANDOFF_KID` explicitly (example: `preview-pr-152-2026-04-01-v1`).

- Rotation:
  - Rotate `INTERNAL_AUTH_HANDOFF_KID` whenever signing keys rotate (scheduled rotation, exposure suspicion, or policy updates).
  - Keep old/new public keys available during transition long enough for in-flight tokens to expire.

## Practical setups

- Same-domain preview (`https://pr-123.preview.example.com` + `/api`):
  - Frontend: unset `API_URL`
  - Backend: set `ALLOWED_ORIGIN_REGEX` to your preview domain pattern
- Cross-domain preview (`https://pr-123.web.preview...` calling `https://api.preview...`):
  - Frontend: set `API_URL=https://api.preview.example.com/api`
  - Backend: set `FRONTEND_URL=https://pr-123.web.preview.example.com` or use `ALLOWED_ORIGIN_REGEX`

## Preview OIDC behavior

- Login starts on preview (`/api/auth/login/google?return_url=...`).
- Google callback is handled by `GOOGLE_OIDC_API_REDIRECT`.
- Callback issues a short-lived handoff code and redirects browser to preview `/auth/consume`.
- Preview exchanges the handoff code at `/api/auth/handoff/exchange`.
- Preview access is checked against `PREVIEW_ALLOWED_GOOGLE_SUBS` before any account DB lookup/signup checks.
- Landing-page `GET /api/sign-up-available` is short-circuited in preview and does not query account counts.

## Browser extension token exchange behavior

The earlier `POST /api/auth/token/exchange-google` design (extension obtains a
Google `id_token` directly via `chrome.identity.launchWebAuthFlow` and POSTs
it to the backend) was Chrome-only and has been **superseded** by the
browser extension PKCE flow that runs on Chrome, Firefox, and Safari.

See [`docs/auth/oidc-login-flow.md`](docs/auth/oidc-login-flow.md) for the
current flow — the extension never sees Google credentials, the OIDC dance
is brokered end-to-end by the backend, and the terminal credentials are a
short-lived internal access JWT plus a rotating refresh token.
