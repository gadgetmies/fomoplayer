# OIDC Login Flow

This document describes every login method available in Fomo Player: Google OIDC
for browser sessions, the CLI PKCE flow for API key creation, the OIDC handoff
flow for Railway PR-preview consumers, and the GitHub Actions OIDC login used by
the automated PR demo-test bot.

The authoritative source of truth is the code:

- `packages/back/passport-setup.js` — Passport OpenID Connect strategy + verify
  callback (account lookup/sign-up policy).
- `packages/back/routes/auth.js` — All `/api/auth/...` routes (`/login/google`,
  `/login/cli`, `/login/cli/google`, `/login/cli/confirm`, `/login/cli/deny`,
  `/login/google/return`, `/login/google/handoff`, `/cli-token`,
  `/api-keys/exchange-handoff`, `/login/actions`).
- `packages/back/routes/shared/cli-auth-code.js` — In-memory PKCE
  authorization code store (`issueCode` / `consumeCode`, 60 s TTL, S256
  verification).
- `packages/back/routes/shared/auth-handoff-token.js` — Handoff JWT mint /
  verify (HS256, 60 s TTL).
- `packages/back/routes/shared/auth-handoff-jti.js` +
  `migrations/sqls/20260331110000-add-auth-handoff-jti-up.sql` — Replay
  protection (one-time-use `jti` table).
- `packages/back/routes/shared/safe-redirect.js` — `isSafeHandoffTarget`
  validates that handoff target hostnames match Railway's PR-preview pattern.
- `packages/back/routes/shared/github-actions-oidc.js` — GitHub Actions OIDC
  JWT verification via JWKS (`verifyActionsToken`).
- `packages/back/config.js` — Reads `OIDC_HANDOFF_URL`, `OIDC_HANDOFF_SECRET`,
  `IS_PREVIEW_ENV`, `GITHUB_ACTIONS_OIDC_REPO`, etc.
- `packages/cli/src/auth.js` — CLI loopback login + handoff exchange.
- `packages/front/src/UserLogin.js` + `packages/front/src/App.js` — Browser
  login link.

> Stale references: `PREVIEW_DEPLOYMENT.md` describes an earlier JWKS / RS256
> "internal handoff" model and a `/api/auth/handoff/exchange` endpoint that no
> longer exists. The current implementation uses a single shared HS256 secret
> (`OIDC_HANDOFF_SECRET`) and the routes documented below. The Chrome
> extension still calls a `POST /api/auth/token/exchange-google` route that
> is referenced from `packages/back/test/tests/users/auth/token-exchange.js`
> but is not currently mounted in `routes/auth.js`; treat that flow as
> not-implemented.

---

## Concepts

### The login methods

There are four distinct login paths:

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

4. **GitHub Actions OIDC login.** Only available on preview environments
   (`IS_PREVIEW_ENV=true` + `GITHUB_ACTIONS_OIDC_REPO` configured). A GitHub
   Actions workflow presents a short-lived JWT signed by GitHub to
   `POST /api/auth/login/actions`. The backend verifies the JWT against
   GitHub's JWKS, confirms the token is from the configured repository, and
   establishes an Express session for a shared bot user. This is used
   exclusively by the PR demo-test workflow — no shared secret is stored
   anywhere.

Both the regular OIDC flow and the handoff flow go through the same Passport
OpenID Connect strategy and the same `/api/auth/login/google/return` callback
handler — what differs is what the callback does with the authenticated user,
and that branch is selected by the OIDC `state` parameter.

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
- Cross-site session cookies. When `IS_PREVIEW_ENV=true`,
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
    backend calls issueCode(userId, C) → opaque 60 s auth code
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
       deletes code (single-use), checks 60 s TTL
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

## GitHub Actions OIDC login (PR demo-test bot)

Only available on Railway PR-preview environments when `IS_PREVIEW_ENV=true`
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
  when `IS_PREVIEW_ENV=true`. Production deployments never set this variable.
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
- `IS_PREVIEW_ENV=true` — toggles `secure`/`SameSite=none` session cookies
  and enables the GitHub Actions OIDC login endpoint.
- `GITHUB_ACTIONS_OIDC_REPO` — the `owner/repo` string that GitHub Actions
  OIDC tokens must claim. Required alongside `IS_PREVIEW_ENV=true` for the
  bot login endpoint to be registered.
- `RAILWAY_SERVICE_NAME` + `RAILWAY_PROJECT_NAME` — read by
  `isSafeHandoffTarget` to validate consumer hostnames.

### Local development (`NODE_ENV=development`)

Defaults from `packages/back/.env.development`:

```
GOOGLE_OIDC_CLIENT_ID=foo
GOOGLE_OIDC_CLIENT_SECRET=bar
GOOGLE_OIDC_API_REDIRECT=
OIDC_HANDOFF_URL=
OIDC_HANDOFF_SECRET=
IS_PREVIEW_ENV=
GOOGLE_OIDC_MOCK=
GITHUB_ACTIONS_OIDC_REPO=
```

- `shouldDelegateToAuthority()` = false, `canMintHandoff` = false (no secret).
- **Browser login: regular OIDC flow** against Google directly.
- **CLI login:** works out of the box. No `OIDC_HANDOFF_SECRET` is required.
- **Bot login:** not available (`IS_PREVIEW_ENV` not set).
- Session cookie: `secure=false`, `SameSite=lax`.

### Tests (`NODE_ENV=test`, `packages/back/.env.test`)

```
GOOGLE_OIDC_MOCK=true
OIDC_HANDOFF_URL=
OIDC_HANDOFF_SECRET=test-handoff-secret
IS_PREVIEW_ENV=
GITHUB_ACTIONS_OIDC_REPO=
```

- `shouldDelegateToAuthority()` = false → tests exercise the **regular flow**
  when hitting `/login/google` and the **PKCE CLI flow** when hitting
  `/login/cli` / `/login/cli/confirm` / `/cli-token`.
- The browser-side handoff path (consumer → authority) is exercised in
  isolation by unit/integration tests rather than by end-to-end runs (see
  `packages/back/test/tests/users/auth/handoff-token.js`,
  `handoff-login-signup-policy.js`, `handoff-invite-codes.js`).
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
- `IS_PREVIEW_ENV=true` so session cookies are cross-site.
- `RAILWAY_SERVICE_NAME` / `RAILWAY_PROJECT_NAME` populated by Railway.
- `GITHUB_ACTIONS_OIDC_REPO` — set if bot login is needed on the authority
  (typically not required; bot targets individual PR preview consumers).
- **Flows used:**
  - Browser login arriving directly at the authority: regular OIDC flow.
  - Browser login from a consumer preview: **handoff flow**.
  - CLI login pointed at the authority: **CLI PKCE flow** ending in an API key.

#### Consumer (PR-preview backend on `…-pr-<N>.up.railway.app`)

- `OIDC_HANDOFF_URL=https://<authority-host>/api/auth/login/google`.
- `OIDC_HANDOFF_SECRET` matches the authority.
- `apiOrigin` differs from `oidcHandoffAuthorityOrigin` →
  `shouldDelegateToAuthority()` = true.
- No Google OIDC client credentials needed.
- `IS_PREVIEW_ENV=true`.
- `RAILWAY_SERVICE_NAME` / `RAILWAY_PROJECT_NAME` populated.
- `GITHUB_ACTIONS_OIDC_REPO=<owner>/<repo>` — enables the bot login endpoint.
- **Flows used:**
  - Browser login: **handoff flow** (consumer → authority → consumer).
  - CLI login: should be pointed at the authority, not a preview consumer.
  - Bot login: **GitHub Actions OIDC** via `POST /api/auth/login/actions`.

### Production

- Single backend acting as the authority.
- `GOOGLE_OIDC_CLIENT_ID` / `GOOGLE_OIDC_CLIENT_SECRET` /
  `GOOGLE_OIDC_API_REDIRECT` set.
- `OIDC_HANDOFF_SECRET` set.
- `IS_PREVIEW_ENV` empty → `SameSite=lax`, no bot login endpoint.
- `GITHUB_ACTIONS_OIDC_REPO` **not set** — bot login endpoint is never mounted.
- **Browser login:** regular OIDC flow.
- **CLI login:** CLI PKCE flow ending in an API key.

---

## Summary table — which flow per environment

| Environment | Backend role | Browser login | CLI login | Bot login |
|---|---|---|---|---|
| Local dev (`NODE_ENV=development`) | Authority (talks to Google) | Regular OIDC | PKCE CLI flow | Not available |
| Test / CI (`NODE_ENV=test`) | Authority (Google mocked) | Regular OIDC against the mock | PKCE CLI flow | Not available |
| Railway preview — authority | Authority | Regular OIDC; also issues handoffs to consumer previews | PKCE CLI flow | Not available (unless `GITHUB_ACTIONS_OIDC_REPO` set) |
| Railway preview — consumer (`…-pr-N…`) | Consumer | Handoff flow via authority | Not the recommended target for CLI | **GitHub Actions OIDC** (`IS_PREVIEW_ENV` + `GITHUB_ACTIONS_OIDC_REPO`) |
| Production | Authority | Regular OIDC | CLI PKCE flow | Not available |

---

## When is the handoff flow needed?

The handoff flow is required precisely when the backend serving the user
cannot itself complete the Google OIDC dance — in this codebase that means
**Railway PR-preview consumer backends running on dynamic hostnames that
aren't registered as Google redirect URIs**.

The CLI flow is unrelated to the handoff machinery. The CLI uses OAuth2
Authorization Code with PKCE: the backend serves a browser confirmation page,
issues an opaque auth code on approval, and the CLI exchanges it (with the
`code_verifier`) for an API key via `POST /api/auth/cli-token`. The API key
never appears in a browser URL. If the user is not yet logged in, the
confirmation page offers a "Log in with Google" button that completes the
regular OIDC dance and returns to the confirmation page — after which the same
PKCE exchange runs.

The GitHub Actions OIDC login is unrelated to both flows above. It is purely
for automated E2E testing on PR preview deployments and is never available on
production.
