# Fomo Player browser extension

The browser extension scrapes the user's Beatport / Bandcamp pages and pushes
the data to the Fomo Player backend. One source tree builds for Chrome,
Firefox, and Safari; the only difference is a small per-browser manifest
overlay.

## Layout

| Path                              | Purpose                                                      |
|-----------------------------------|--------------------------------------------------------------|
| `src/manifest.base.json`          | Shared manifest (action, options page, host_permissions, …). |
| `src/manifest.<browser>.json`     | Per-browser overlay deep-merged into the base at build time. |
| `src/js/service_worker.js`        | Background worker (MV3 service worker on Chrome).            |
| `src/js/auth.js`                  | PKCE login, refresh-token rotation, token storage.           |
| `src/js/auth-callback.js`         | Loaded by `auth-callback.html` after the backend redirect.   |
| `src/js/content/{beatport,bandcamp}.js` | Declared content scripts that scrape the active tab.   |
| `src/js/popup/`                   | Popup React app.                                             |
| `src/js/options/`                 | Options page React app.                                      |
| `src/js/transforms/`              | Pure-data transforms (also imported by `packages/back/`).    |
| `src/js/browser.js`               | `webextension-polyfill` shim (use `import browser from …`).  |

## Build

```sh
FRONTEND_URL=https://fomoplayer.com yarn build              # all three browsers
FRONTEND_URL=https://fomoplayer.com yarn build:chrome       # → build/chrome/
FRONTEND_URL=https://fomoplayer.com yarn build:firefox      # → build/firefox/
FRONTEND_URL=https://fomoplayer.com yarn build:safari       # → build/safari/
```

`FRONTEND_URL` (or `REACT_APP_FRONTEND_URL`) is **required** — the build
fails fast when it is missing. The repo CLAUDE.md disallows deployment
domains in source, so the URL must come from the env at build time.

The webpack config picks the manifest overlay from `BROWSER` (default
`chrome`) and writes the result to `build/<browser>/`. `NODE_ENV=production`
is set by the build scripts so the bundle does not contain HMR / eval. To
work on the popup with hot reload locally, run `BROWSER=chrome yarn start`
with `FRONTEND_URL` pointed at your local backend.

## Loading the extension during development

- **Chrome / Edge:** open `chrome://extensions/`, enable Developer mode, click
  "Load unpacked", and point at `build/chrome/`.
- **Firefox:** `npx web-ext run --source-dir=build/firefox` (or load via
  `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on").
- **Safari:** `xcrun safari-web-extension-converter build/safari` to generate
  the Xcode project, then run it from Xcode (Safari ≥ 16.4).

## Auth

The extension never sees Google credentials. The user signs in to Fomo
Player (Google OIDC happens upstream on `fomoplayer.com`); the extension
only stores the Fomo Player-issued JWT access token + a rotating refresh
token returned from `/api/auth/extension/token`.

The login flow is:

1. Worker generates PKCE `code_verifier` and `code_challenge` (Web Crypto).
2. Worker opens a tab to `${appUrl}/api/auth/login/extension?...` with a
   `redirect_uri` it controls — `browser.runtime.getURL('auth-callback.html')`.
3. After consent, the backend redirects to that URI with `?code=…&state=…`.
4. `auth-callback.html` reads the URL and `runtime.sendMessage`s the worker.
5. Worker exchanges the code for tokens at `/api/auth/extension/token`.

`redirect_uri` is required. The shipped allowlist
(`EXTENSION_OAUTH_ALLOWED_REDIRECT_PATTERNS`) covers `chrome-extension://`,
`moz-extension://`, and `safari-web-extension://` `auth-callback.html`.
Override it (comma-separated regexes) only if you ship from a different
origin shape.

## Backend env required for the extension to talk to the backend

The backend must allow the extension's *origin* through CORS, allow the
extension *id* through the OAuth flow, and have keys configured to mint
extension access tokens.

| Env var | Required? | What for |
|---|---|---|
| `EXTENSION_OAUTH_ALLOWED_IDS` | yes | Comma-separated list of allowed extension IDs (the value `browser.runtime.id` returns for each browser you support). Chrome: 32-char `[a-p]` derived from `EXTENSION_KEY`. Firefox: the gecko id from `manifest.firefox.json` (`fomoplayer-extension@fomoplayer.com`) or a `{UUID}`. Safari: the macOS/iOS *Extension* target's bundle identifier from Xcode (e.g. `com.gadgetmies.fomoplayer.Extension`). |
| `INTERNAL_AUTH_HANDOFF_PRIVATE_KEY` / `INTERNAL_AUTH_HANDOFF_ISSUER` / `INTERNAL_AUTH_API_AUDIENCE` | yes | RS256 key + JWT iss/aud claims for the extension access tokens. Without all three, every extension auth route returns 503 "Extension login is not configured on this backend". |
| `ADDITIONAL_ORIGINS` | yes (CORS) | Comma-separated origins to allow through CORS. Add `chrome-extension://<id>` for every Chrome install you want to allow, and the `moz-extension://<UUID>` / `safari-web-extension://<UUID>` equivalents for Firefox / Safari. The hard-coded extension origin that used to live in `packages/back/config.js` was removed — every extension origin now must be supplied via env. |
| `ALLOWED_ORIGIN_REGEX` | optional | Cleaner alternative to listing each id by hand: `^chrome-extension://[a-p]{32}$,^moz-extension://[0-9a-f-]{36}$,^safari-web-extension://[0-9A-Fa-f-]{36}$`. |
| `EXTENSION_OAUTH_ALLOWED_REDIRECT_PATTERNS` | optional | Override the default redirect-URI regexes. The shipped defaults cover Chrome / Firefox / Safari `auth-callback.html`. |

## Tests

```sh
yarn test                       # mocha + transforms tests in this package
yarn lint:firefox               # web-ext lint against the Firefox build
yarn workspace fomoplayer_back test --regex 'extension-token|cli-auth-code'
```

The backend tests cover the full extension token flow (PKCE, redirect-URI
binding, refresh rotation, reuse detection, logout). This package's tests
cover the pure-data transforms.
