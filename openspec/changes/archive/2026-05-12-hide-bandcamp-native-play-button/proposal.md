## Why

Bandcamp's native play button (in the album-page header and overlaid on the
cover image) drives Bandcamp's own audio element and bypasses the Fomo Player
extension's queue and heard tracking. Since the extension already injects its
own Play / Queue / Add-to-Fomo trio next to Bandcamp's controls, the user
doesn't need Bandcamp's native button — leaving it visible creates two
competing playback affordances and invites users to start playback through
the wrong one. Hiding it by default removes the foot-gun while keeping the
escape hatch (Bandcamp's player still works if the user opts in via the
extension options).

## What Changes

- Add an extension option **"Hide Bandcamp's native play button"** to
  `options.html`. Default: **on** (hide).
- Persist the setting in `browser.storage.local`.
- In the Bandcamp content script, when the option is enabled, hide
  Bandcamp's native play affordances via injected CSS:
  - `.inline_player` — the whole audio-player widget on `/album/...` and
    `/track/...` pages.
  - `.play-button` — the cover-overlay play button on release pages
    **and** the per-entry play buttons on the user feed
    (`https://bandcamp.com/<user>/feed`).
  - `.play-col` — the per-row play column inside the track-list table on
    release pages.
- React to live changes to the setting (via `browser.storage.onChanged`)
  so toggling the option in another tab applies on open Bandcamp pages
  without a reload.
- **Out of scope** (deliberately deferred — the original task brief
  considered these, but the simpler "just hide it" approach lands the same
  user value first):
  - Overriding the native button's click handler.
  - Injecting a new Queue button next to the cover-overlay play button.

## Capabilities

### New Capabilities
- `bandcamp-native-play-button-visibility`: an extension setting that
  hides Bandcamp's own play buttons on release / track pages, with the
  hide applied by content-script CSS that reacts to live setting changes.

### Modified Capabilities

_(none)_

## Impact

- `packages/browser-extension/src/js/options/Root.jsx` — new checkbox row.
- `packages/browser-extension/src/js/content/bandcamp/` — new module (or
  block within `inject.js`) that injects/removes the hide CSS based on the
  stored setting and a `storage.onChanged` listener.
- `browser.storage.local` — new key (e.g. `hideBandcampNativePlay`). On
  first read, treat `undefined` as `true` (default-on without writing back).
- No backend, DB, or worker contract changes.
