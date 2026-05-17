# Fomo Player browser extension

The browser extension scrapes the user's Beatport / Bandcamp pages and pushes
the data to the Fomo Player backend. One source tree builds for Chrome,
Firefox, and Safari; the only difference is a small per-browser manifest
overlay.

## Supported browsers

| Browser           | Build target          | Manifest overlay              | Distribution                                                                  |
|-------------------|-----------------------|-------------------------------|-------------------------------------------------------------------------------|
| Chrome / Chromium | `yarn build:chrome`   | `src/manifest.chrome.json`    | Load `build/chrome/` unpacked, or pack as a `.crx` for the Chrome Web Store.  |
| Firefox           | `yarn build:firefox`  | `src/manifest.firefox.json`   | `web-ext run --source-dir=build/firefox` for dev, signed XPI via AMO.         |
| Safari (≥ 16.4)   | `yarn build:safari`   | `src/manifest.safari.json`    | Run `xcrun safari-web-extension-converter build/safari` and ship via Xcode.   |

Edge and other Chromium-based browsers can load the Chrome build unpacked but
are not packaged for store distribution.

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

## Watch mode

For tight iteration, run `yarn watch` to keep webpack rebuilding into
`build/<browser>/` on every save. The watcher does **not** auto-reload
the extension in your browser — after each rebuild you still hit the
"reload" button on Chrome's `chrome://extensions/` page (or re-run
`web-ext run --source-dir=build/firefox` if you killed it).

```sh
FRONTEND_URL=https://fomoplayer.com yarn watch              # default: chrome
FRONTEND_URL=https://fomoplayer.com yarn watch:chrome       # → build/chrome/
FRONTEND_URL=https://fomoplayer.com yarn watch:firefox      # → build/firefox/
FRONTEND_URL=https://fomoplayer.com yarn watch:all          # both at once
FRONTEND_URL=https://fomoplayer.com BROWSERS=chrome,firefox yarn watch
```

`BROWSERS` accepts a comma-separated list of `chrome` and / or
`firefox`. Each rebuild's stats summary is prefixed with the target
name (`[chrome] compiled successfully …`) so multi-target watching is
followable.

**Safari is intentionally unsupported in watch mode.** Loading an
unpacked Safari Web Extension needs `xcrun safari-web-extension-converter`
followed by an Xcode rebuild + re-sign + re-install, which a Node
watcher cannot drive. Use the `yarn build:safari` flow above and the
Xcode-based loop documented in the next section instead.

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

## Releases

End users should grab archives from the [GitHub Releases page](https://github.com/gadgetmies/multi_store_player/releases) — every release attaches three assets:

| File | Browser | Install |
|---|---|---|
| `fomo-player-extension-chrome-<version>.zip` | Chrome / Chromium | unzip → `chrome://extensions/` → "Load unpacked" |
| `fomo-player-extension-firefox-<version>.zip` | Firefox | unzip → `about:debugging` → "Load Temporary Add-on" → pick `manifest.json` |
| `fomo-player-extension-safari-source-<version>.zip` | Desktop Safari (≥ 16.4) | unzip → open `Fomo Player/Fomo Player.xcodeproj` in Xcode → pick your Apple ID's Personal Team under Signing & Capabilities for both targets → ⌘R. Full step-by-step is in the zip's bundled `README.md` (`safari-source-README.md` in this repo). |

The Safari archive is a **source bundle**, not a `.app`. Each user signs and builds it locally with their own Apple ID — that's the only way Safari accepts the extension's signature without us holding a paid Apple Developer membership ($99/yr) and notarizing in CI. The trade-off is the Personal Team signature expires every ~7 days and the user has to ⌘R again to refresh.

### Producing a release (maintainers)

Releases are built by `.github/workflows/extension-release.yml`. To cut one:

```sh
git tag v1.2.3
git push origin v1.2.3
```

The tag push starts the workflow, which on a single Ubuntu runner builds the Chrome and Firefox bundles, runs `yarn build:safari` to produce `build/safari/`, packages the Safari source bundle (Xcode project + `build/safari/` + recipient install doc), and attaches all three zips to the GitHub Release matching the tag.

You can also dispatch the workflow manually from the Actions UI (or `gh workflow run extension-release.yml`) — manual runs upload the zips as workflow artifacts only and do not create a Release.

**Required repository configuration**

| Setting | Where | Value |
|---|---|---|
| `FRONTEND_URL_PROD` | repo **Variables** (Settings → Secrets and variables → Actions → Variables) | The production frontend URL the build should be pinned to, e.g. `https://fomoplayer.com`. The build fails fast if this variable is unset — that's deliberate, see the top-of-repo `CLAUDE.md` rule against deployment domains in source. |
| `EXTENSION_KEY` | repo **Variables** (same place) | Base64-encoded RSA public key baked into the Chrome manifest's `key` field. Without it, every "Load unpacked" install gets a random extension ID, which won't match the backend's `EXTENSION_OAUTH_ALLOWED_IDS` allowlist. The key is public (it ships in the manifest), so a variable is the correct shape — not a secret. See "Generating EXTENSION_KEY" below. |
| `GITHUB_TOKEN` write permission | repo Settings → Actions → General → Workflow permissions | "Read and write permissions" (or set `permissions: contents: write` in the workflow — already done). Needed for `softprops/action-gh-release` to attach assets. |

### Generating EXTENSION_KEY

One-time setup. Generate an RSA keypair, keep the **private** key off the repo, register the **public** key as a repo variable, and compute the derived extension ID for the backend allowlist.

```sh
# 1. Generate a fresh RSA keypair (keep this file private).
openssl genrsa -out fomo-player-extension.private.pem 2048

# 2. Derive the public key in the DER+base64 form Chrome expects.
EXTENSION_KEY=$(openssl rsa -in fomo-player-extension.private.pem -pubout -outform DER 2>/dev/null \
  | base64 | tr -d '\n')
echo "$EXTENSION_KEY"

# 3. Compute the Chrome extension ID Chrome will derive from that key.
EXTENSION_ID=$(echo "$EXTENSION_KEY" | base64 -d \
  | openssl dgst -sha256 -binary \
  | head -c 16 | xxd -p \
  | tr '0-9a-f' 'a-p')
echo "$EXTENSION_ID"

# 4. Register the public key as a repo variable for the workflow to consume.
gh variable set EXTENSION_KEY --body "$EXTENSION_KEY"

# 5. Add $EXTENSION_ID to the backend's EXTENSION_OAUTH_ALLOWED_IDS env var
#    (wherever the backend is deployed). This is what makes the OAuth flow
#    accept tokens from extensions built from this CI key.
```

Store `fomo-player-extension.private.pem` somewhere durable (password manager, hardware key, ops-team vault). You don't need it for "Load unpacked" or for current CI — it's only required if you later sign `.crx` packages for Chrome Web Store distribution. **Don't commit it.**

## Tests

```sh
yarn test                       # mocha + transforms tests in this package
yarn lint:firefox               # web-ext lint against the Firefox build
yarn workspace fomoplayer_back test --regex 'extension-token|cli-auth-code'
```

The backend tests cover the full extension token flow (PKCE, redirect-URI
binding, refresh rotation, reuse detection, logout). This package's tests
cover the pure-data transforms.
