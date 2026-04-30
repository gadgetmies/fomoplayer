# OIDC Login Flow

This document describes every login method available in Fomo Player: Google OIDC
for browser sessions, the CLI PKCE flow for API key creation, the OIDC handoff
flow for Railway PR-preview consumers, the Chrome extension PKCE flow for
short-lived JWT issuance, and the GitHub Actions OIDC login used by the
automated PR demo-test bot.

The authoritative source of truth is the code:

- `packages/back/passport-setup.js` — Passport OpenID Connect strategy + verify
  callback (account lookup/sign-up policy).
- `packages/back/routes/auth.js` — All `/api/auth/...` routes (`/login/google`,
  `/login/cli`, `/login/cli/google`, `/login/cli/confirm`, `/login/cli/deny`,
  `/login/google/return`, `/login/google/handoff`, `/cli-token`,
  `/api-keys/exchange-handoff`, `/login/actions`, `/login/extension`,
  `/login/extension/google`, `/login/extension/confirm`,
  `/login/extension/deny`, `/extension/token`, `/extension/logout`).
- `packages/back/routes/shared/cli-auth-code.js` — In-memory PKCE
  authorization code store (`issueCode` / `consumeCode`, 5 min TTL, S256
  verification with `timingSafeEqual`). Shared by both the CLI flow and the
  Chrome extension flow.
- `packages/back/routes/shared/auth-handoff-token.js` — Handoff JWT mint /
  verify (HS256, 60 s TTL).
- `packages/back/routes/shared/auth-handoff-jti.js` +
  `migrations/sqls/20260331110000-add-auth-handoff-jti-up.sql` — Replay
  protection (one-time-use `jti` table).
- `packages/back/routes/shared/safe-redirect.js` — `isSafeHandoffTarget`
  validates that handoff target hostnames match Railway's PR-preview pattern.
- `packages/back/routes/shared/github-actions-oidc.js` — GitHub Actions OIDC
  JWT verification via JWKS (`verifyActionsToken`).
- `packages/back/token-server.js` — Internal access JWT mint
  (`issueInternalToken`, RS256 / HS256) and verify (`verifyInternalToken`,
  JWKS or static public key). Used by the Chrome extension flow to issue
  short-lived bearer JWTs.
- `packages/back/db/extension-refresh-token.js` +
  `migrations/sqls/20260501100000-add-extension-refresh-token-up.sql` —
  Hashed-and-rotated refresh-token store for the Chrome extension flow.
- `packages/back/config.js` — Reads `OIDC_HANDOFF_URL`, `OIDC_HANDOFF_SECRET`,
  `PREVIEW_ENV`, `GITHUB_ACTIONS_OIDC_REPO`, `EXTENSION_OAUTH_ALLOWED_IDS`,
  `INTERNAL_AUTH_HANDOFF_PRIVATE_KEY`, `INTERNAL_AUTH_HANDOFF_KEY_ID`,
  `INTERNAL_AUTH_HANDOFF_ISSUER`, `INTERNAL_AUTH_HANDOFF_JWKS_URL`,
  `INTERNAL_AUTH_API_AUDIENCE`, etc.
- `packages/cli/src/auth.js` — CLI loopback login + handoff exchange.
- `packages/chrome-extension/src/js/service_worker.js` — Extension PKCE
  login + token refresh.
- `packages/front/src/UserLogin.js` + `packages/front/src/App.js` — Browser
  login link.

> Stale references: `PREVIEW_DEPLOYMENT.md` describes an earlier JWKS / RS256
> "internal handoff" model and a `/api/auth/handoff/exchange` endpoint that no
> longer exists. The current implementation uses a single shared HS256 secret
> (`OIDC_HANDOFF_SECRET`) and the routes documented below.
>
> The Chrome extension previously had a `POST /api/auth/token/exchange-google`
> design (see `packages/back/test/tests/users/auth/token-exchange.js`) where
> the extension obtained a Google `id_token` directly via
> `chrome.identity.launchWebAuthFlow` and POSTed it to the backend in exchange
> for an internal JWT. That design is **superseded** by the Chrome extension
> PKCE flow documented below — the extension never sees a Google credential
> and the OIDC dance is brokered end-to-end by the backend. The
> `token-exchange.js` test and the `service_worker.js` `exchange-google` call
> site should be removed alongside the new flow's implementation.

---

## Concepts

### The login methods

There are five distinct login paths:

1. **Regular OIDC flow.** A browser performs the OIDC redirect dance directly
   against the backend that talks to Google. On Google's callback the backend
   creates an Express session via `req.login(user)` and redirects to the
   frontend. This is the simple case and is what runs locally, in tests, in
   production, and on the production "authority" backend itself.

2. **Handoff flow.** Google only allows a fixed set of registered
   `redirect_uri` values per OAuth client. PR-preview backends running on
   dynamic Railway hostnames cannot each register their own redirect URI. So
   one backend (the **authority**) owns the registered Google redirect URI
   and performs the actual OIDC dance, then hands off the authenticated
   identity to the **consumer** backend (preview or CLI loopback) by minting
   a short-lived, single-use HMAC-signed token. The consumer verifies the
   token and either logs the user in (browser preview) or creates an API
   key (CLI).

3. **CLI PKCE flow.** The CLI implements OAuth2 Authorization Code with PKCE
   (RFC 7636). The backend serves a browser confirmation page; on approval it
   issues an opaque single-use authorization code that the CLI exchanges (with
   the `code_verifier`) for an API key. No browser redirect URI or Google
   credential is needed beyond the initial browser login that establishes the
   user session.

4. **Chrome extension PKCE flow.** The Chrome extension uses the same PKCE
   machinery as the CLI, but the redirect target is the extension's
   synthetic redirect URI `https://<extensionId>.chromiumapp.org` (handled
   by `chrome.identity.launchWebAuthFlow`) instead of a localhost loopback
   port, and the terminal credentials are a short-lived **internal access
   JWT** (signed by the backend, verified via JWKS) plus a long-lived,
   single-use, rotating **refresh token**. The extension never sees a Google
   credential — the OIDC dance happens end-to-end on the backend.

5. **GitHub Actions OIDC login.** Only available on preview environments
   (`PREVIEW_ENV=true` + `GITHUB_ACTIONS_OIDC_REPO` configured). A GitHub
   Actions workflow presents a short-lived JWT signed by GitHub to
   `POST /api/auth/login/actions`. The backend verifies the JWT against
   GitHub's JWKS, confirms the token is from the configured repository, and
   establishes an Express session for a shared bot user. This is used
   exclusively by the PR demo-test workflow — no shared secret is stored
   anywhere.

Both the regular OIDC flow and the handoff flow go through the same Passport
OpenID Connect strategy and the same `/api/auth/login/google/return` callback
handler — what differs is what the callback does with the authenticated user,
and that branch is selected by the OIDC `state` parameter. The CLI and Chrome
extension flows share the same `issueCode` / `consumeCode` PKCE store and
the same `/api/auth/login/google/return` callback (selecting their branch via
`state.returnToCli` / `state.returnToExtension`); they differ only in their
redirect target and the credential format they ultimately issue.

### Handoff token format

`packages/back/routes/shared/auth-handoff-token.js`. Used by the browser
handoff flow (authority → preview consumer). Not used by the CLI flow.

- **Claims:** `sub` = Google subject id, `oidcIssuer` = normalized OIDC issuer
  (e.g. `accounts.google.com`), `iss`, `aud`, `jti` (random UUID), `iat`,
  `exp`.
- **Audience binding:** `iss` = authority origin, `aud` = consumer origin.
- **Verification:** `verifyHandoffToken` — requires `sub`, `oidcIssuer`, `jti`,
  `exp`.

The TTL is `HANDOFF_TOKEN_TTL_SECONDS = 60` with 5 s clock tolerance. Replay
protection: every accepted `jti` is inserted into `auth_handoff_jti` with
`INSERT ... ON CONFLICT DO NOTHING`; a second use is rejected
(`packages/back/routes/shared/auth-handoff-jti.js`).

`POST /api-keys/exchange-handoff` verifies the token, consumes the `jti`,
looks up the user by `(oidcIssuer, sub)`, and returns `{ key, id, name }`.

### Configuration that picks the flow

`packages/back/routes/auth.js` derives three values at startup from
`packages/back/config.js`:

```js
const isSelfReferentialHandoffUrl = Boolean(
  oidcHandoffAuthorityOrigin && apiOrigin && oidcHandoffAuthorityOrigin === apiOrigin,
)
const isHandoffConsumerConfigured = Boolean(
  oidcHandoffUrl && oidcHandoffAuthorityOrigin && oidcHandoffSecret,
)
const canMintHandoff = Boolean(oidcHandoffSecret && apiOrigin)

const shouldDelegateToAuthority = () => {
  if (!isHandoffConsumerConfigured) return false
  return !isSelfReferentialHandoffUrl
}
```

| Value | True when | Meaning |
|---|---|---|
| `shouldDelegateToAuthority()` | `OIDC_HANDOFF_URL` is set, points to a different origin than this backend, **and** `OIDC_HANDOFF_SECRET` is set | This backend is a **consumer** — it will redirect `/login/google` to the authority and accept handoff at `/login/google/handoff` |
| `isSelfReferentialHandoffUrl` | `OIDC_HANDOFF_URL` resolves to the same origin as `apiOrigin` | This backend is the **authority**; delegation is skipped (PR previews inherit this var, so it has to be detected at runtime) |
| `canMintHandoff` | `OIDC_HANDOFF_SECRET` is set and `apiOrigin` is known | This backend can sign handoff tokens (required for both browser-handoff to consumer previews **and** for CLI login) |

`isSafeHandoffTarget` (`packages/back/routes/shared/safe-redirect.js`) gates
which target origins the authority will mint a handoff for. It enforces that
the host matches the Railway PR-preview pattern
`<RAILWAY_SERVICE_NAME>-<RAILWAY_PROJECT_NAME>-pr-<n>.up.railway.app` and is
served over `https`.

---

## Browser login flow (web app)

`packages/front/src/App.js` builds the link the user clicks:

```js
const googleLoginPath = `${config.apiURL}/auth/login/google?returnPath=${encodeURIComponent(buildLoginReturnPath())}`
```

### Regular flow (no delegation)

```
Browser ──GET /api/auth/login/google?returnPath=…──▶ Backend
Backend ──302 to Google /o/oauth2/auth (state={returnPath})──▶ Browser
Browser completes Google login
Google ──GET /api/auth/login/google/return?code=…&state=…──▶ Backend
Backend (passport verify): finds or creates account, applies sign-up policy
Backend req.login(user) → sets session cookie
Backend ──302 to ${frontendURL}${returnPath}──▶ Browser
```

Account lookup and sign-up policy live in
`packages/back/passport-setup.js`. Sign-up is denied with
`Sign up is not available` when `accountCount > MAX_ACCOUNT_COUNT` and no
valid `inviteCode` is on the session; both denials end up redirecting to
`${frontendURL}/?loginFailed=true` via `redirectWithLoginFailed`.

### Handoff flow (preview consumer → authority)

When the preview backend has `OIDC_HANDOFF_URL` (authority's
`/api/auth/login/google`) and `OIDC_HANDOFF_SECRET` set:

```
1. Browser ──GET https://pr-N…/api/auth/login/google?returnPath=…──▶ Preview (consumer)
2. Consumer (shouldDelegateToAuthority()=true)
   ──302 to https://authority/api/auth/login/google
       ?returnPath=…&handoffTarget=https://pr-N…──▶ Browser
3. Browser ──GET /login/google?…&handoffTarget=…──▶ Authority
4. Authority validates handoffTarget via isSafeHandoffTarget
5. Authority ──passport.authenticate('openidconnect',
       state={returnPath, handoffTarget})──▶ Google
6. Google ──/api/auth/login/google/return──▶ Authority
7. Authority verifies, looks up user (its own DB), mints handoff JWT:
       iss = authorityOrigin, aud = handoffTarget origin,
       sub = google sub, oidcIssuer = accounts.google.com
8. Authority ──302 to ${handoffTarget}/api/auth/login/google/handoff
       ?token=…&returnPath=…──▶ Browser
9. Browser ──GET /api/auth/login/google/handoff?token=…──▶ Consumer
10. Consumer verifies JWT (issuer=authority, audience=apiOrigin),
    consumes jti (replay protection), looks up or creates account
    in its own DB (consumer applies its own sign-up policy / invite-code
    check), then req.login(user) → consumer session cookie
11. Consumer ──302 to ${consumerFrontendURL}${returnPath}──▶ Browser
```

Important details:

- The preview consumer must have its **own** `OIDC_HANDOFF_SECRET` matching
  the authority's. The token is verified locally; no network call back to
  the authority is made.
- The preview consumer never talks to Google. Only the authority has a
  Google OAuth client and a registered redirect URI.
- Sign-up policy runs on the consumer (it has the consumer's user table) —
  the authority's user record is irrelevant here. The consumer's
  `req.session.inviteCode` is consulted just like in the regular flow.
- Cross-site session cookies. When `PREVIEW_ENV=true`,
  `packages/back/index.js` sets `cookie.secure=true` and
  `cookie.sameSite='none'` so the session cookie set in step 10 survives
  the cross-origin redirect.

---

## CLI login flow (`fomoplayer login`)

The CLI implements **OAuth2 Authorization Code with PKCE** (RFC 7636), the
same pattern used by first-party CLI tools such as GitHub CLI and Stripe CLI.
This prevents the long-lived API key from ever appearing in the browser URL
bar or history.

`packages/cli/src/auth.js` always:
1. Generates a random `codeVerifier` (32 cryptographic bytes, base64url),
   derives `codeChallenge = base64url(SHA256(codeVerifier))`, and a random
   `state` (16 bytes, base64url).
2. Binds a random port `P` on `127.0.0.1`.
3. Opens
   `${apiUrl}/api/auth/login/cli?callbackPort=P&code_challenge=…&code_challenge_method=S256&state=…`
   in the browser.
4. Waits up to 120 s for a `?code=…&state=…` GET to arrive on that port.
5. Verifies the returned `state` matches what was sent (CSRF protection).
6. POSTs `{ code, code_verifier }` to `POST /api/auth/cli-token`.
7. Responds to the browser with a styled "Login successful" HTML page.
8. Stores the returned `fp_<uuid>` API key in `~/.fomoplayer/config.json`.

What happens in steps 3–6 depends on whether the user already has a browser
session.

### Path A — user already logged in to the web app

```
1. CLI opens browser to
   ${apiUrl}/api/auth/login/cli?callbackPort=P&code_challenge=C&code_challenge_method=S256&state=S
2. GET /login/cli (user has session):
   backend stores P, C, S in session,
   serves HTML page: "Grant CLI access?" with Allow / Deny buttons
3a. User clicks Allow →
    POST /login/cli/confirm (session carries P, C, S)
    backend calls issueCode(userId, C) → opaque 5 min auth code
    302 to http://localhost:P/?code=<code>&state=S
3b. User clicks Deny →
    POST /login/cli/deny
    backend serves "Access denied. You can close this tab." page
    (CLI times out after 120 s)
4. (Allow path) CLI loopback receives ?code=&state=,
   verifies state === S,
   POSTs { code, code_verifier } to POST /api/auth/cli-token:
     backend calls consumeCode(code, codeVerifier):
       verifies base64url(SHA256(codeVerifier)) === stored codeChallenge
       deletes code (single-use), checks 5 min TTL
       creates fp_<uuid>, stores SHA-256 hash in api_key table
       returns { access_token: "fp_<uuid>", token_type: "bearer" }
   CLI stores the API key; all subsequent requests use
   Authorization: Bearer fp_<uuid>
```

### Path B — user not yet logged in

```
1. CLI opens browser to
   ${apiUrl}/api/auth/login/cli?callbackPort=P&code_challenge=C&code_challenge_method=S256&state=S
2. GET /login/cli (no session):
   backend stores P, C, S in session,
   serves HTML page: "Fomo Player CLI Access" with "Log in with Google" button
3. User clicks "Log in with Google" →
   GET /login/cli/google?callbackPort=P
   passport.authenticate('openidconnect',
     state = { returnToCli: true, cliCallbackPort: P })
4. Browser → Google OIDC dance → GET /login/google/return
5. Return handler (returnToCli branch):
   req.login(user) — establishes browser session
   302 to /api/auth/login/cli?callbackPort=P
   (session already carries C and S from step 2)
6. GET /login/cli (user now has session) → same as Path A step 2 onward
```

### Notable properties

- The CLI never sees user credentials or the OIDC ID/access token.
- The `fp_<uuid>` API key **never appears in a browser URL or redirect**. The
  browser only ever sees an opaque, single-use authorization code.
- The API key is created only after the user explicitly approves on the
  browser confirmation page and only after the CLI presents the correct
  `code_verifier`. Denial delivers no key; the CLI times out cleanly after 120 s.
- `codeVerifier` never leaves the CLI process. An attacker who intercepts the
  `?code=&state=` redirect cannot exchange the code without it.
- There is no auto sign-up. The user must already have an account (established
  via the web app login) before confirming CLI access.

---

## Chrome extension login flow

The Chrome extension uses the same **OAuth 2.0 Authorization Code with PKCE**
machinery as the CLI (RFC 7636), but with two differences:

1. The browser redirect target is the extension's synthetic redirect URI
   `https://<extensionId>.chromiumapp.org`, surfaced to the extension by
   `chrome.identity.launchWebAuthFlow`. There is no localhost loopback
   listener — service workers cannot bind ports.
2. The terminal credentials are a short-lived **internal access JWT**
   (RS256, ~15 min, verified by the existing `jwt-internal` Passport
   strategy in `passport-setup.js` against the configured JWKS) plus a
   long-lived, single-use, **rotating refresh token** (`fp_rt_<uuid>`,
   stored hashed in `extension_refresh_token`). This matches the
   unattended, runs-in-the-background nature of an extension: access tokens
   expire fast, refresh rotates on every use, and reuse of a rotated
   refresh token revokes the entire chain.

The extension itself **never sees a Google credential.** The OIDC dance
happens end-to-end on the backend — the extension only ever talks to
`/api/auth/login/extension` and `/api/auth/extension/token`. From the user's
browser perspective, the only "Google" page that ever loads is the standard
Google consent screen reached via the backend's existing `/login/google`
redirect inside `chrome.identity.launchWebAuthFlow`'s window.

### Why the extension does not exchange Google ID tokens directly

An earlier draft of this flow had the extension obtain a Google `id_token`
via `chrome.identity.launchWebAuthFlow` against
`https://accounts.google.com/o/oauth2/auth?response_type=id_token&...` and
POST it to a `POST /api/auth/token/exchange-google` endpoint that minted an
internal JWT in return. That design is rejected because:

1. **Implicit grant has no refresh token.** A Google ID token is valid for
   ~1 hour, after which the extension must re-launch
   `launchWebAuthFlow`. The earlier draft cached the Google ID token in
   `chrome.storage.local` and reused it as a refresh primitive — a security
   smell (caching a Google bearer credential beyond exchange) that only
   works for that single hour anyway.
2. **The extension would be its own Google OAuth client.** That requires
   `manifest.oauth2.client_id` and ties the design to Chrome's identity
   API. PKCE-through-backend works in Firefox and Safari extensions too.
3. **Implicit flow is deprecated.** OAuth 2.0 Security BCP (RFC 9700) and
   OAuth 2.1 both discourage `response_type=id_token` in favour of
   authorization code with PKCE.

The flow below uses the same Google OAuth client the web app and CLI use,
keeps the Google credential entirely server-side, and reuses the existing
`cli-auth-code.js` PKCE store and `passport-setup.js` OIDC strategy.

### Endpoints

- `GET  /api/auth/login/extension` — entry point opened by
  `chrome.identity.launchWebAuthFlow`. Validates the requesting `extensionId`
  against the `EXTENSION_OAUTH_ALLOWED_IDS` allowlist (env-configured,
  comma-separated Chrome extension IDs) and the PKCE parameters
  (`code_challenge` non-empty, `code_challenge_method=S256`, `state`
  non-empty), stashes them in the session, and serves a consent / login
  HTML page. Mirrors `/login/cli`.
- `GET  /api/auth/login/extension/google` — initiates Google OIDC with
  `state = { returnToExtension: true, extensionId }`. Mirrors
  `/login/cli/google`.
- `POST /api/auth/login/extension/confirm` — user clicks "Allow"; backend
  re-validates `extensionId` against the allowlist, calls
  `issueCode(userId, codeChallenge)` to mint a one-time auth code (5 min
  TTL), clears session-stored params, and redirects the browser to
  `https://<extensionId>.chromiumapp.org/?code=<code>&state=<state>`.
- `POST /api/auth/login/extension/deny` — user clicks "Deny"; serves a
  "closed window" HTML page. Mirrors `/login/cli/deny`.
- `POST /api/auth/extension/token` — token endpoint, two modes:
  - `{ code, code_verifier }` — first acquisition. Calls
    `consumeCode(code, codeVerifier)` to verify the S256 challenge and
    consume the single-use auth code. Mints internal access JWT (RS256,
    900 s TTL, `iss = INTERNAL_AUTH_HANDOFF_ISSUER`, `aud =
    INTERNAL_AUTH_API_AUDIENCE`, `sub = userId`, `kid =
    INTERNAL_AUTH_HANDOFF_KEY_ID`). Generates `fp_rt_<uuid>`, inserts
    SHA-256 hash into `extension_refresh_token` (`user_id`,
    `extension_id`, `token_hash`, `created_at`, `expires_at` — default
    90 days, `last_used_at`, `revoked_at`, `replaced_by_id`). Returns
    `{ access_token, refresh_token, expires_in: 900 }`.
  - `{ refresh_token }` — refresh. Looks up by hash; checks not revoked,
    not expired, `replaced_by_id IS NULL`. If `replaced_by_id` is set this
    is a **reuse** — revokes the entire chain (every token transitively
    linked through `replaced_by_id`) and returns 401. Otherwise: issues
    new pair, sets old row's `replaced_by_id = new.id`. Same response
    shape.
- `POST /api/auth/extension/logout` — body `{ refresh_token }`; sets
  `revoked_at = NOW()` on that row. Idempotent.

The internal access JWT is verified by the **existing** `jwt-internal`
Passport strategy slot in `packages/back/index.js:112-156`: any
`Authorization: Bearer <token>` where the token does not start with `fp_`
is routed through `passport.authenticate('jwt-internal')` if
`INTERNAL_AUTH_HANDOFF_JWKS_URL` and `INTERNAL_AUTH_HANDOFF_ISSUER` are
configured. The strategy verifies signature against the JWKS, checks
`iss === INTERNAL_AUTH_HANDOFF_ISSUER` and
`aud === INTERNAL_AUTH_API_AUDIENCE`, then resolves `req.user` from
`account.findByUserId(payload.sub)`.

The backend signs with `INTERNAL_AUTH_HANDOFF_PRIVATE_KEY` (PEM) +
`INTERNAL_AUTH_HANDOFF_KEY_ID` (kid). `GET /api/auth/.well-known/jwks.json`
publishes the matching public JWK so the same backend (or any other
configured consumer) can verify without the private key.

> Choosing JWT here is not architecturally required — opaque tokens with
> per-request DB lookup (the model `fp_<uuid>` API keys use) would also
> work. JWT was chosen because (a) the extension fires a high volume of
> API calls during scraping, so stateless verification removes a per-call
> DB hit, and (b) the `jwt-internal` strategy slot, JWKS exposure, and
> matching test (`passport-strategies.js`) already exist in the codebase.

### Path A — user already logged in to the web app

```
1. Extension service worker generates codeVerifier (32 random bytes,
   base64url), codeChallenge = base64url(SHA256(codeVerifier)),
   state (16 random bytes, base64url). Calls
   chrome.identity.launchWebAuthFlow({
     interactive: true,
     url: ${apiUrl}/api/auth/login/extension
       ?extensionId=<chrome.runtime.id>
       &code_challenge=C
       &code_challenge_method=S256
       &state=S
   })

2. Browser GET /login/extension (user has session):
   backend validates extensionId against EXTENSION_OAUTH_ALLOWED_IDS,
   stores extensionId, C, S in session,
   serves HTML consent page with Allow / Deny buttons.

3a. User clicks Allow →
    POST /login/extension/confirm
    backend re-validates extensionId, calls issueCode(userId, C)
      → opaque single-use auth code with 5 min TTL
    302 to https://<extensionId>.chromiumapp.org/?code=<code>&state=S

3b. User clicks Deny →
    POST /login/extension/deny
    backend serves "Access denied" page.
    launchWebAuthFlow eventually closes; extension treats as cancellation.

4. (Allow path) launchWebAuthFlow callback fires with the redirected URL.
   Extension parses ?code and ?state, verifies state === S
     (CSRF protection — rejects mismatch), then
   POSTs { code, code_verifier } to POST /api/auth/extension/token:
     backend calls consumeCode(code, codeVerifier):
       verifies base64url(SHA256(codeVerifier)) === stored codeChallenge
         (timingSafeEqual), deletes code (single-use), checks 5 min TTL
     mints internal access JWT (RS256, 15 min, sub=userId,
       aud=INTERNAL_AUTH_API_AUDIENCE, iss=INTERNAL_AUTH_HANDOFF_ISSUER,
       kid=INTERNAL_AUTH_HANDOFF_KEY_ID)
     creates fp_rt_<uuid>, stores SHA-256 hash in extension_refresh_token
       (user_id, extension_id, token_hash, expires_at = NOW() + 90 days)
     returns { access_token, refresh_token, expires_in: 900 }

5. Extension stores refresh_token in chrome.storage.local and
   { access_token, expires_at } in chrome.storage.session.
   All API calls go out as Authorization: Bearer <access_token>.

6. When the access token is near expiry (or the API returns 401):
   POST /api/auth/extension/token { refresh_token }
   backend rotates: issues new pair, sets old.replaced_by_id = new.id.
   Reuse of an already-rotated refresh token revokes the entire chain.
```

### Path B — user not yet logged in

```
1. Extension launches launchWebAuthFlow as in Path A.

2. Browser GET /login/extension (no session):
   backend validates extensionId against the allowlist,
   stores extensionId, C, S in session,
   serves HTML page with "Log in with Google" button.

3. User clicks "Log in with Google" →
   GET /login/extension/google
   passport.authenticate('openidconnect',
     state = { returnToExtension: true, extensionId })

4. Browser → Google OIDC dance → GET /login/google/return.

5. Return handler (returnToExtension branch):
   req.login(user) — establishes browser session,
   302 to /api/auth/login/extension
   (session already carries extensionId, C, S from step 2)

6. GET /login/extension (user now has session) → same as Path A
   step 2 onward.
```

### Extension-side storage

- **Refresh token** in `chrome.storage.local` (persists across browser
  restarts, scoped to the extension; treat as a password). Cleared on
  explicit logout.
- **Access token** + `expiresAt` in `chrome.storage.session` (in-memory
  across MV3 service worker evictions, cleared when the browser closes).
  Survives service-worker termination; doesn't survive a browser restart,
  which is fine because the refresh token re-mints it.
- The Google `id_token`, Google access token, and Google refresh token are
  **never** stored client-side. They live only on the backend, only for
  the duration of the OIDC return-handler call.

### Notable properties

- The extension never sees Google credentials.
- The internal access JWT and refresh token never appear in a browser URL
  (only the opaque, single-use auth code does).
- PKCE binds the redirect to the extension instance: an attacker observing
  the `?code=…` redirect cannot exchange it without `code_verifier`.
- The `extensionId` allowlist (`EXTENSION_OAUTH_ALLOWED_IDS`) prevents an
  unrelated extension from initiating the flow against Fomo Player's
  consent page and getting a redirect to its own `chromiumapp.org` host.
- Refresh-token rotation + reuse detection means a stolen refresh token
  has a finite useful lifetime: the moment the legitimate extension uses
  its copy, the stolen one is invalidated (and vice-versa); reuse of
  either revokes the chain.
- Access JWTs are stateless — no DB hit per API call. This matters because
  the extension fires a high volume of requests during track scraping.
- There is no auto sign-up. The user must already have an account
  (established via the web app login) before confirming extension access.

### Configuration

In addition to the variables that the regular OIDC flow already requires:

- `EXTENSION_OAUTH_ALLOWED_IDS` — comma-separated list of Chrome extension
  IDs (`<32 lowercase letters>`) permitted to initiate the flow.
  Production should list only the published Web Store extension ID;
  development can add an unpacked extension's ID alongside it. The flow
  is unavailable when this is empty.
- `INTERNAL_AUTH_HANDOFF_PRIVATE_KEY` — PEM-encoded RS256 private key used
  to sign internal access JWTs.
- `INTERNAL_AUTH_HANDOFF_KEY_ID` — `kid` value embedded in the JWT header
  and the JWKS, used for key rotation.
- `INTERNAL_AUTH_HANDOFF_ISSUER` — the `iss` claim minted into JWTs
  (typically `apiOrigin`).
- `INTERNAL_AUTH_HANDOFF_JWKS_URL` — JWKS endpoint the `jwt-internal`
  Passport strategy fetches the public key from for verification
  (typically `${apiOrigin}/api/auth/.well-known/jwks.json`).
- `INTERNAL_AUTH_API_AUDIENCE` — the `aud` claim minted into JWTs and
  enforced on verification (typically `${apiOrigin}/api`).

When `INTERNAL_AUTH_HANDOFF_JWKS_URL` and `INTERNAL_AUTH_HANDOFF_ISSUER`
are unset, `packages/back/index.js:112` registers no `jwt-internal`
strategy and the `jwt-internal` slot returns 401 for any non-`fp_`
bearer token. The extension flow is therefore disabled wholesale unless
all five `INTERNAL_AUTH_*` keys plus `EXTENSION_OAUTH_ALLOWED_IDS` are
configured.

---

## GitHub Actions OIDC login (PR demo-test bot)

Only available on Railway PR-preview environments when `PREVIEW_ENV=true`
**and** `GITHUB_ACTIONS_OIDC_REPO` is set.

This flow lets an automated GitHub Actions workflow log in to a preview backend
without any shared secret. It relies on GitHub's built-in OIDC token service:
each workflow run can request a short-lived, RS256-signed JWT that
cryptographically proves which repository and workflow minted it.

### How it works

```
1. GitHub Actions workflow (pr-demo.yml) requests an OIDC token from
   GitHub's token service via the Actions token API (curl with
   ACTIONS_ID_TOKEN_REQUEST_TOKEN), with audience = PREVIEW_URL.

2. Workflow calls:
   POST ${PREVIEW_URL}/api/auth/login/actions
   { "token": "<GitHub OIDC JWT>" }

3. Backend (preview consumer, isPreviewEnv=true):
   a. Fetches GitHub's JWKS from
      https://token.actions.githubusercontent.com/.well-known/jwks.json
      (cached via jwks-rsa)
   b. Verifies JWT signature (RS256), issuer, expiry
   c. Checks aud === apiOrigin  (prevents token reuse on a different preview)
   d. Checks repository claim === GITHUB_ACTIONS_OIDC_REPO
      (prevents tokens from forks or unrelated repos)
   e. Calls account.findOrCreateByIdentifier(
        'token.actions.githubusercontent.com',
        githubActionsOidcRepo
      ) → shared bot user (created on first login, reused thereafter)
   f. req.login(user) → Express session cookie

4. Workflow uses Playwright's page.request.post() for step 2 so the
   Set-Cookie response is automatically stored in the browser context's
   cookie jar. Subsequent page.goto() calls carry the session cookie.

5. Playwright runs the demo steps from the PR body with video recording.
```

### Security properties

- **No shared secret.** The JWT is signed by GitHub's private key and verified
  against their public JWKS. There is nothing to leak.
- **Audience binding.** Each Railway PR preview has a unique hostname. The
  `aud` claim is set to `PREVIEW_URL` in the workflow and validated against
  `apiOrigin` on the backend. A token minted for `pr-5` cannot be replayed
  against `pr-6`.
- **Repository binding.** The `repository` claim is checked against
  `GITHUB_ACTIONS_OIDC_REPO`. Tokens from forks or other repositories are
  rejected.
- **Production never exposes this endpoint.** The route is registered only
  when `PREVIEW_ENV=true`. Production deployments never set this variable.
- **Bot user is isolated.** The bot user is identified by issuer
  `token.actions.githubusercontent.com` and subject = the repo name. It
  shares no credentials with human users and cannot access production.

### Playwright session establishment

`page.request` in Playwright shares the same cookie jar as the browser
context. Cookies set by the `POST /api/auth/login/actions` response are
automatically available to all subsequent `page.goto()` navigations:

```js
// Login: cookie stored automatically in context
const loginRes = await page.request.post(`${PREVIEW_URL}/api/auth/login/actions`, {
  data: { token: oidcToken },
})
// All subsequent navigations carry the session cookie
await page.goto('/tracks/recent')
```

### Demo mode (slowMo + video + visual overlay)

When `PREVIEW_URL` is set, `test/lib/setup.js` automatically enables:
- **slowMo** — defaults to 600 ms per action (override with `PW_SLOWMO`),
  making every interaction visible to a human reviewer.
- **Video recording** — written to `VIDEO_DIR` when set; finalized when the
  browser context closes (wired to `process.beforeExit`).
- **Visual overlay** — injected into every page via `context.addInitScript()`:
  an orange cursor indicator, click ripple effects, a keyboard badge showing
  currently-held keys, and a scroll-direction arrow.

### Test seeding in remote mode

The existing browser tests seed fixture tracks via direct DB access locally.
In remote mode (`PREVIEW_URL` set), `test/lib/seed.js` instead POSTs the
same transformed fixture data to the existing `POST /api/me/tracks` endpoint
(the same path the Chrome extension uses), so the bot user's track list is
populated before assertions run. `test/lib/test-user.js` fetches the bot
user's ID from `GET /api/auth/me`.

---

## Per-environment configuration

These are the environment variables that determine which flows are available:

- `OIDC_HANDOFF_URL` — if set and points to a different origin than this
  backend, this backend acts as a **consumer**.
- `OIDC_HANDOFF_SECRET` — required to mint or verify handoff tokens. Must be
  identical on authority and all consumers (and on the same backend that
  exposes the CLI exchange endpoint).
- `GOOGLE_OIDC_CLIENT_ID` / `GOOGLE_OIDC_CLIENT_SECRET` /
  `GOOGLE_OIDC_API_REDIRECT` — only required on the backend that actually
  talks to Google (the authority).
- `PREVIEW_ENV=true` — toggles `secure`/`SameSite=none` session cookies
  and enables the GitHub Actions OIDC login endpoint.
- `GITHUB_ACTIONS_OIDC_REPO` — the `owner/repo` string that GitHub Actions
  OIDC tokens must claim. Required alongside `PREVIEW_ENV=true` for the
  bot login endpoint to be registered.
- `RAILWAY_SERVICE_NAME` + `RAILWAY_PROJECT_NAME` — read by
  `isSafeHandoffTarget` to validate consumer hostnames.
- `EXTENSION_OAUTH_ALLOWED_IDS` — comma-separated Chrome extension IDs
  permitted to start the extension PKCE flow. Empty disables the flow.
- `INTERNAL_AUTH_HANDOFF_PRIVATE_KEY` / `INTERNAL_AUTH_HANDOFF_KEY_ID` —
  signing material for internal access JWTs minted by
  `/api/auth/extension/token`. Required on any backend that issues
  extension tokens.
- `INTERNAL_AUTH_HANDOFF_ISSUER` / `INTERNAL_AUTH_HANDOFF_JWKS_URL` /
  `INTERNAL_AUTH_API_AUDIENCE` — verification material for the
  `jwt-internal` Passport strategy. When unset, `Bearer` tokens that don't
  start with `fp_` are rejected with 401 (extension flow disabled).

### Local development (`NODE_ENV=development`)

Defaults from `packages/back/.env.development`:

```
GOOGLE_OIDC_CLIENT_ID=foo
GOOGLE_OIDC_CLIENT_SECRET=bar
GOOGLE_OIDC_API_REDIRECT=
OIDC_HANDOFF_URL=
OIDC_HANDOFF_SECRET=
PREVIEW_ENV=
GOOGLE_OIDC_MOCK=
GITHUB_ACTIONS_OIDC_REPO=
EXTENSION_OAUTH_ALLOWED_IDS=<unpacked-extension-id>
INTERNAL_AUTH_HANDOFF_PRIVATE_KEY=<dev RS256 PEM>
INTERNAL_AUTH_HANDOFF_KEY_ID=dev-1
INTERNAL_AUTH_HANDOFF_ISSUER=http://localhost:5000
INTERNAL_AUTH_HANDOFF_JWKS_URL=http://localhost:5000/api/auth/.well-known/jwks.json
INTERNAL_AUTH_API_AUDIENCE=http://localhost:5000/api
```

- `shouldDelegateToAuthority()` = false, `canMintHandoff` = false (no secret).
- **Browser login: regular OIDC flow** against Google directly.
- **CLI login:** works out of the box. No `OIDC_HANDOFF_SECRET` is required.
- **Extension login:** works once `EXTENSION_OAUTH_ALLOWED_IDS` includes the
  unpacked extension's ID and the `INTERNAL_AUTH_*` keys are populated. A
  generated dev key pair under `packages/back/.dev-keys/` is fine for local.
- **Bot login:** not available (`PREVIEW_ENV` not set).
- Session cookie: `secure=false`, `SameSite=lax`.

### Tests (`NODE_ENV=test`, `packages/back/.env.test`)

```
GOOGLE_OIDC_MOCK=true
OIDC_HANDOFF_URL=
OIDC_HANDOFF_SECRET=test-handoff-secret
PREVIEW_ENV=
GITHUB_ACTIONS_OIDC_REPO=
```

- `shouldDelegateToAuthority()` = false → tests exercise the **regular flow**
  when hitting `/login/google` and the **PKCE CLI flow** when hitting
  `/login/cli` / `/login/cli/confirm` / `/cli-token`.
- The browser-side handoff path (consumer → authority) is exercised in
  isolation by unit/integration tests rather than by end-to-end runs (see
  `packages/back/test/tests/users/auth/handoff-token.js` and
  `handoff-login-signup-policy.js`).
- The GitHub Actions OIDC endpoint is tested with mocked `verifyActionsToken`
  in `packages/back/test/tests/users/auth/actions-oidc-login.js`.

CI (`packages/back/.env.ci`) is the same shape.

### Railway PR previews

Two roles, same codebase, different env values:

#### Authority (the "main" Railway environment that owns the Google client)

- `GOOGLE_OIDC_CLIENT_ID` / `GOOGLE_OIDC_CLIENT_SECRET` set.
- `GOOGLE_OIDC_API_REDIRECT=https://<authority-host>/api/auth/login/google/return`
  (registered in Google).
- `OIDC_HANDOFF_SECRET` set.
- `OIDC_HANDOFF_URL` may either be unset or point to the authority itself —
  if it points to the authority's own origin, `isSelfReferentialHandoffUrl`
  is `true` and delegation is skipped.
- `PREVIEW_ENV=true` so session cookies are cross-site.
- `RAILWAY_SERVICE_NAME` / `RAILWAY_PROJECT_NAME` populated by Railway.
- `GITHUB_ACTIONS_OIDC_REPO` — set if bot login is needed on the authority
  (typically not required; bot targets individual PR preview consumers).
- **Flows used:**
  - Browser login arriving directly at the authority: regular OIDC flow.
  - Browser login from a consumer preview: **handoff flow**.
  - CLI login pointed at the authority: **CLI PKCE flow** ending in an API key.
  - Extension login pointed at the authority: **Chrome extension PKCE flow**
    ending in an internal access JWT + refresh token (when `INTERNAL_AUTH_*`
    keys and `EXTENSION_OAUTH_ALLOWED_IDS` are configured).

#### Consumer (PR-preview backend on `…-pr-<N>.up.railway.app`)

- `OIDC_HANDOFF_URL=https://<authority-host>/api/auth/login/google`.
- `OIDC_HANDOFF_SECRET` matches the authority.
- `apiOrigin` differs from `oidcHandoffAuthorityOrigin` →
  `shouldDelegateToAuthority()` = true.
- No Google OIDC client credentials needed.
- `PREVIEW_ENV=true`.
- `RAILWAY_SERVICE_NAME` / `RAILWAY_PROJECT_NAME` populated.
- `GITHUB_ACTIONS_OIDC_REPO=<owner>/<repo>` — enables the bot login endpoint.
- **Flows used:**
  - Browser login: **handoff flow** (consumer → authority → consumer).
  - CLI login: should be pointed at the authority, not a preview consumer.
  - Extension login: should be pointed at the authority, not a preview
    consumer (preview consumers don't run the Google OIDC dance themselves
    and the JWT signing keys typically live only on the authority).
  - Bot login: **GitHub Actions OIDC** via `POST /api/auth/login/actions`.

### Production

- Single backend acting as the authority.
- `GOOGLE_OIDC_CLIENT_ID` / `GOOGLE_OIDC_CLIENT_SECRET` /
  `GOOGLE_OIDC_API_REDIRECT` set.
- `OIDC_HANDOFF_SECRET` set.
- `PREVIEW_ENV` empty → `SameSite=lax`, no bot login endpoint.
- `GITHUB_ACTIONS_OIDC_REPO` **not set** — bot login endpoint is never mounted.
- `EXTENSION_OAUTH_ALLOWED_IDS` set to the published Web Store extension ID.
- All five `INTERNAL_AUTH_*` keys set so the `jwt-internal` Passport strategy
  is registered and the extension flow is operational.
- **Browser login:** regular OIDC flow.
- **CLI login:** CLI PKCE flow ending in an API key.
- **Extension login:** Chrome extension PKCE flow ending in an internal
  access JWT + refresh token.

---

## Summary table — which flow per environment

| Environment | Backend role | Browser login | CLI login | Extension login | Bot login |
|---|---|---|---|---|---|
| Local dev (`NODE_ENV=development`) | Authority (talks to Google) | Regular OIDC | PKCE CLI flow | PKCE extension flow (when `INTERNAL_AUTH_*` + `EXTENSION_OAUTH_ALLOWED_IDS` set) | Not available |
| Test / CI (`NODE_ENV=test`) | Authority (Google mocked) | Regular OIDC against the mock | PKCE CLI flow | PKCE extension flow (mocked Google + ephemeral key pair) | Not available |
| Railway preview — authority | Authority | Regular OIDC; also issues handoffs to consumer previews | PKCE CLI flow | PKCE extension flow | Not available (unless `GITHUB_ACTIONS_OIDC_REPO` set) |
| Railway preview — consumer (`…-pr-N…`) | Consumer | Handoff flow via authority | Not the recommended target for CLI | Not the recommended target for the extension | **GitHub Actions OIDC** (`PREVIEW_ENV` + `GITHUB_ACTIONS_OIDC_REPO`) |
| Production | Authority | Regular OIDC | CLI PKCE flow | PKCE extension flow | Not available |

---

## When is the handoff flow needed?

The handoff flow is required precisely when the backend serving the user
cannot itself complete the Google OIDC dance — in this codebase that means
**Railway PR-preview consumer backends running on dynamic hostnames that
aren't registered as Google redirect URIs**.

The CLI and Chrome extension flows are unrelated to the handoff machinery.
Both use OAuth2 Authorization Code with PKCE against the same Fomo Player
backend that already runs the regular OIDC dance: the backend serves a
browser confirmation page, issues an opaque single-use auth code on
approval, and the client exchanges it (with the `code_verifier`) at a
token endpoint. The CLI's redirect target is `http://localhost:<port>/`
and its token endpoint mints a permanent `fp_<uuid>` API key. The
extension's redirect target is `https://<extensionId>.chromiumapp.org`
and its token endpoint mints a short-lived internal access JWT plus a
rotating refresh token. Neither credential ever appears in a browser
URL — only the opaque auth code does. If the user is not yet logged in,
each flow's confirmation page offers a "Log in with Google" button that
completes the regular OIDC dance with a flow-specific marker in the OIDC
`state` (`returnToCli` / `returnToExtension`), then returns to the
respective confirmation page.

The GitHub Actions OIDC login is unrelated to both flows above. It is purely
for automated E2E testing on PR preview deployments and is never available on
production.
