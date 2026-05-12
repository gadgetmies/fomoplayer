## 1. Options page

- [x] 1.1 In `packages/browser-extension/src/js/options/Root.jsx`, add `hideBandcampNativePlay` to the storage `get` call, treating `undefined` as `true`, and store it in component state.
- [x] 1.2 Render a new checkbox row labelled "Hide Bandcamp's native play button" wired to that state.
- [x] 1.3 On toggle, write the new boolean to `browser.storage.local` via the existing storage helper pattern (same shape as the `enabledStores` toggle).

## 2. Content-script hide

- [x] 2.1 Create `packages/browser-extension/src/js/content/bandcamp/hide-native-play.js` with the selectors `.inline_player, .play-button, .play-col` (covers the release-page audio-player widget, the cover-overlay play button, the per-entry play buttons on the user feed, and the per-row play column inside the track-list table) and an `install()` entry point.
- [x] 2.2 In `install()`, read `hideBandcampNativePlay` from `browser.storage.local` (treating `undefined` as `true`), inject a `<style data-fp-hide-native-play>` element into `document.head` with `display: none !important` rules for the selectors, and set the element's `disabled` flag to `!hideBandcampNativePlay`.
- [x] 2.3 Guard injection with the `data-fp-hide-native-play` attribute so a re-call of `install()` reuses the existing element rather than appending a duplicate.
- [x] 2.4 Subscribe to `browser.storage.onChanged` and, when `hideBandcampNativePlay` changes, flip the `disabled` flag on the injected `<style>` element accordingly.
- [x] 2.5 Wire `install()` from `bandcamp.js` (the content-script entry) at startup, unconditionally — the hide is a pure CSS rule tied to a user preference and should apply regardless of login state, which `inject.js`'s installation does depend on.

## 3. Verification

- [x] 3.1 Build the extension and load it unpacked.
- [x] 3.2 Fresh install: open a Bandcamp `/album/...` page; confirm the whole `.inline_player` widget, the cover-overlay `.play-button`, and every track-row `.play-col` are not visible, while the extension's own Play / Queue / Add-to-Fomo buttons remain in the title section and on every track row.
- [x] 3.3 Open a Bandcamp `/track/...` page; same expectation as 3.2.
- [x] 3.4 Open `https://bandcamp.com/<user>/feed`; confirm every per-entry `.play-button` is hidden while the extension's own Play / Queue / Add-to-Fomo controls on those entries remain.
- [x] 3.5 Open the options page, uncheck "Hide Bandcamp's native play button"; confirm that already-open Bandcamp tabs reveal `.inline_player` and `.play-button` without a reload.
- [x] 3.6 Re-check the option; confirm the native affordances hide again on the already-open tabs.
- [x] 3.7 Reload an open Bandcamp tab with the option re-checked; confirm the hide is still applied (persistence works).

## 4. Archive

- [x] 4.1 Once verified, run `openspec archive hide-bandcamp-native-play-button` to merge the spec deltas into `openspec/specs/`.
- [x] 4.2 Move `backlog/in-progress/f-003-bandcamp-cover-controls-override` to `backlog/done/003-bandcamp-cover-controls-override` (ordering prefix stripped per the backlog README) and note in `backlog/tasks/003-bandcamp-cover-controls-override/notes.md` that the original "override the click + add cover-overlay Queue button" scope was deliberately narrowed to "hide via setting".
