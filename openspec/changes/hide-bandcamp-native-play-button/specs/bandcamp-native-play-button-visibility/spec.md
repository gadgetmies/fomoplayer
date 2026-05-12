## ADDED Requirements

### Requirement: Options page exposes a "Hide Bandcamp's native play button" toggle

The extension options page SHALL render a checkbox labelled "Hide Bandcamp's native play button". The checkbox's checked state MUST be bound to the `hideBandcampNativePlay` key in `browser.storage.local`, defaulting to checked when the key is unset, and toggling the checkbox MUST persist the new boolean value to `browser.storage.local` immediately.

#### Scenario: Checkbox renders checked on first open

- **WHEN** the user opens the options page on a fresh install (no `hideBandcampNativePlay` value stored)
- **THEN** the "Hide Bandcamp's native play button" checkbox renders checked.

#### Scenario: Toggling persists to storage

- **WHEN** the user unchecks the "Hide Bandcamp's native play button" checkbox
- **THEN** `browser.storage.local.hideBandcampNativePlay` is set to `false`
- **AND** re-opening the options page later renders the checkbox unchecked.

#### Scenario: Re-checking persists to storage

- **WHEN** the user checks a previously-unchecked "Hide Bandcamp's native play button" checkbox
- **THEN** `browser.storage.local.hideBandcampNativePlay` is set to `true`.

### Requirement: Bandcamp native play affordances are hidden when the setting is enabled

When `hideBandcampNativePlay` is `true` (or unset), the content script SHALL hide Bandcamp's native play affordances by injecting a stylesheet that applies `display: none !important` to `.inline_player` (the release-page audio-player widget on `/album/...` and `/track/...` pages), to `.play-button` (the cover-overlay play button on release pages and the per-entry play buttons on the user feed at `https://bandcamp.com/<user>/feed`), and to `.play-col` (the per-row play column inside the track-list table on release pages). The extension's own injected Play / Queue / Add-to-Fomo controls MUST remain visible and functional, because they live in shadow-DOM hosts that the selectors do not match.

#### Scenario: Default-on hides the release-page player widget, cover-overlay button, and per-row play columns

- **WHEN** the user loads a Bandcamp `/album/...` page on a fresh install (no `hideBandcampNativePlay` value stored)
- **THEN** the page's `.inline_player` widget is rendered with `display: none`
- **AND** the cover-overlay `.play-button` is rendered with `display: none`
- **AND** every track-row `.play-col` cell in the track-list table is rendered with `display: none`
- **AND** the extension's own Play / Queue / Add-to-Fomo buttons remain visible in the title section and on every track row.

#### Scenario: Default-on hides the player widget and cover-overlay button on a track page

- **WHEN** the user loads a Bandcamp `/track/...` page on a fresh install
- **THEN** `.inline_player` and the cover-overlay `.play-button` are hidden, while the extension's own Play / Queue / Add-to-Fomo buttons remain visible.

#### Scenario: Default-on hides per-entry play buttons on the user feed

- **WHEN** the user loads `https://bandcamp.com/<user>/feed` on a fresh install
- **THEN** every `.play-button` rendered on a feed entry is hidden, while the extension's own Play / Queue / Add-to-Fomo controls on those entries remain visible.

#### Scenario: Setting disabled — native affordances remain visible

- **WHEN** the user has unchecked "Hide Bandcamp's native play button" and loads any Bandcamp release, track, or feed page
- **THEN** `.inline_player` and `.play-button` render with their natural Bandcamp visibility (no hide rule applied).

### Requirement: Setting changes apply to open Bandcamp pages without reload

When `hideBandcampNativePlay` changes in `browser.storage.local`, the content script SHALL react via `browser.storage.onChanged` and update the hide stylesheet's enabled state in already-open Bandcamp tabs without requiring a reload.

#### Scenario: Disabling the setting reveals native affordances live

- **WHEN** a Bandcamp `/album/...` page is open with the default-on hide applied, and the user unchecks "Hide Bandcamp's native play button" in another tab's options page
- **THEN** the open Bandcamp page's `.inline_player` widget and `.play-button` become visible without a reload.

#### Scenario: Re-enabling the setting re-hides native affordances live

- **WHEN** a Bandcamp `/album/...` page is open with the setting currently disabled (native affordances visible), and the user re-checks the option in another tab
- **THEN** the open page's `.inline_player` and `.play-button` are hidden again without a reload.

### Requirement: Hide injection is idempotent

The content script SHALL inject at most one hide stylesheet per Bandcamp page (identified by the `data-fp-hide-native-play` attribute on the `<style>` element), and re-runs of the install routine MUST NOT add a duplicate stylesheet.

#### Scenario: Multiple install calls produce one stylesheet

- **WHEN** the content script's install routine is invoked more than once in the same page (for example, by a hot-reload cycle in development)
- **THEN** `document.head` contains exactly one `<style data-fp-hide-native-play>` element.
