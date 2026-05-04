# Configuration policy

**No deployment domains in source code.** Hostnames or URLs that vary by
environment (production, preview, staging, self-hosted) must come from
configuration — environment variables, the `fomoplayer_shared/config` loader,
or app-time settings stored in the user's profile / extension storage.

This rule applies to:
- Backend: read `frontendURL` / `apiURL` from `fomoplayer_shared/config`,
  not literal strings.
- Front-end: read URLs through `fomoplayer_shared/config` or the runtime
  config the build injects via `EnvironmentPlugin` / `DefinePlugin`.
- Extension: read `DEFAULT_APP_URL` (baked in from `FRONTEND_URL` at build
  time) or the user-configured `appUrl` from `browser.storage.local`. The
  build must fail when `FRONTEND_URL` is unset rather than fall back to a
  literal — silent fallbacks have caused production builds to ship pointing
  at `localhost`.
- CLI: read `FOMOPLAYER_API_URL` from the environment.

Exceptions:
- **Tests** may use `fomoplayer.com` (or any stable hostname) as a fixture
  string — they are not deployed.
- **Identifiers that look like domains but aren't deployment URLs** —
  e.g. the Firefox gecko extension ID `fomoplayer-extension@fomoplayer.com`,
  email-style identifiers, OIDC issuer URLs that name a fixed authority —
  may stay as-is; they need to be stable across environments.

When introducing a new URL, ask: "would this break if someone deployed Fomo
Player at a different host?" If yes, route it through configuration.

# Bandcamp specifics

**Bandcamp "previews" are full tracks.** Anything labelled `preview` for a
Bandcamp track in this codebase (transforms, payloads, the `tracks.previews`
array) actually points at the full streaming MP3 — Bandcamp does not gate
audio behind a snippet.

Implications:
- Don't apply preview-window logic (start_ms / end_ms skip windows) on
  Bandcamp playback as if it were a 30-second clip — you'd be skipping
  songs mid-listen.
- For "heard" reporting, match the frontend `Preview.js` behaviour: mark a
  track heard the moment audio starts playing (`onPlay`), not after some
  duration threshold. The frontend uses no time threshold and Bandcamp
  full-track streams should not invent one.
- `duration` and `end_ms` on previews equal the full track duration, so
  treat the preview window as the full track on Bandcamp.
