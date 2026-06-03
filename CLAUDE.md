# UI changes require demo recordings

**Any change that is visible in the UI must ship with paired demo tests.**
When a feature touches the front-end, an admin view, or the extension popup,
follow the `demo-tests` skill (`.claude/skills/demo-tests/SKILL.md`): add a
`demo-test` (local) and a `demo-preview` browser test under
`packages/back/test/browser/`, written to share as much code as possible
(only the state-seeding differs), and add both fenced ` ```demo-test ` /
` ```demo-preview ` blocks to the PR body so the demo workflows record a
preview video. demo-preview must seed state via the UI/API only (no DB);
demo-test reuses that and may fall back to direct DB seeding only when
necessary.

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

# Database naming conventions

Two rules apply to every table in this schema. They are load-bearing because
the codebase uses `NATURAL JOIN` heavily — same column name = same meaning =
correct join.

1. **Non-FK columns are prefixed with the table name.** For example
   `user_notification_audio_sample` has
   `user_notification_audio_sample_file_size`,
   `user_notification_audio_sample_object_key`, etc. — never bare
   `file_size` / `object_key`. The prefix makes columns globally unique
   across the schema, so a `NATURAL JOIN` only unifies the FK column you
   intended.
2. **Foreign-key columns use the exact name of the referenced parent PK
   column** (not a renamed or prefixed variant). For example a row in
   `user_notification_audio_sample_match` that references
   `user_notification_audio_sample(user_notification_audio_sample_id)`
   stores it in a column called `user_notification_audio_sample_id` —
   not `parent_sample_id` or `sample_id`. This is what lets
   `match NATURAL JOIN user_notification_audio_sample` succeed: the
   shared column name IS the FK relationship.

Together these mean `match NATURAL JOIN store__track_preview NATURAL JOIN
store__track NATURAL JOIN user_notification_audio_sample` composes from
left to right with no aliases and no `ON` clauses — each step adds the
parent it FKs to via the rule-2-named column.

Canonical examples in the schema: the `user_notification_audio_sample*`
family (`*_embedding`, `*_fingerprint`, `*_match`) and the
`store__track*` family. New tables MUST follow these rules so existing
NATURAL JOIN chains keep composing.

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
