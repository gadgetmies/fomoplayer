## Context

`packages/browser-extension/src/js/content/bandcamp/inject.js` already
injects Fomo Player Play / Queue / Add-to-Fomo controls into Bandcamp
release pages, discography tiles, and feeds. Heard reporting and queue
state flow through the existing `bandcamp:enqueue` worker route triggered
by those injected controls.

Bandcamp also renders its own native play affordances, which start
playback through Bandcamp's `<audio>` element and bypass the extension
entirely:

- `.inline_player` — the audio-player widget at the top of `/album/...`
  and `/track/...` pages (contains the header play button, the progress
  bar, and the track list controls).
- `.play-button` — the play button overlaid on the cover artwork on a
  release page, **and** the per-entry play buttons on the user feed
  (`https://bandcamp.com/<user>/feed`).
- `.play-col` — the per-row play column inside the track-list table on
  release pages (the small native play triangle Bandcamp renders next to
  each track number).

Since the extension's own Play and Queue controls already cover the
release-level intent, the per-track intent, and the feed-entry intent,
the simplest fix is to hide Bandcamp's native affordances so the user
reaches for the extension's controls instead of starting parallel
Bandcamp playback. We do not need to intercept clicks or replace handlers.

The extension already has an options page (`options.html` →
`options/Root.jsx`) that writes to `browser.storage.local`. Content
scripts already read from `browser.storage.local`
(see `appUrl` / `enabledStores`). Adding one more boolean key fits the
existing pattern.

## Goals / Non-Goals

**Goals:**
- A `hideBandcampNativePlay` setting in `browser.storage.local`, default
  on (undefined treated as true).
- Options page exposes a "Hide Bandcamp's native play button" checkbox
  bound to that setting.
- When the setting is on, Bandcamp's `.inline_player` widget (release /
  track pages) and every `.play-button` (release-page cover overlay and
  feed-entry buttons) are hidden via injected CSS.
- Toggling the setting in another tab applies on open Bandcamp pages
  without a reload (live `storage.onChanged` listener).

**Non-Goals:**
- Overriding Bandcamp's click handlers or pausing its `<audio>` element.
  Hiding the affordance is enough; the user reaches for the extension's
  Play / Queue buttons instead.
- Adding a Queue button to the cover overlay.
- Hiding any *other* Bandcamp native controls (track-row plays inside
  the track-list table, the persistent mini player, etc.). Out of scope
  here.

## Decisions

### 1. Hide via injected CSS, not DOM removal

The content script injects a single `<style data-fp-hide-native-play>`
element into `document.head` whose body is the union of selectors for
Bandcamp's native play affordances. Toggling the setting flips the
style element's `disabled` flag (or removes / re-inserts it). The DOM
of Bandcamp's controls is left intact.

**Why CSS over DOM removal:**
Bandcamp's player script may read those elements (state, layout) even
when invisible. Hiding via CSS keeps Bandcamp's UI internally consistent
and is trivial to reverse (flip a flag). DOM removal would invite hard-to-
diagnose breakages if Bandcamp's script later queries for the missing
nodes.

**Why a `<style>` element over an inline style on each match:**
A single style tag is idempotent and is invariant to Bandcamp re-rendering
its DOM — the rule applies whenever a matching element appears, without
the content script needing to walk the DOM. No MutationObserver needed
for the hide path.

### 2. Selectors

- `.inline_player` — the audio-player widget on `/album/...` and
  `/track/...` pages. Hiding the whole widget (rather than just the
  inner button) avoids leaving an empty player frame in the page and
  removes the parallel playback affordance Bandcamp wires up internally.
- `.play-button` — the cover-overlay play button on release pages and
  the per-entry play buttons on the user feed
  (`https://bandcamp.com/<user>/feed`). Both surfaces use the same class
  name, so one selector covers both.
- `.play-col` — the per-row play column inside the track-list table on
  release pages. Bandcamp draws a small native play triangle there; the
  extension's per-row Play / Queue / Add-to-Fomo controls live in a
  separate wrap mounted next to `.time`, so hiding `.play-col` does not
  affect them.

Selectors live as a single constant at the top of the new module so
future Bandcamp redesigns are a one-line fix.

The rule is `display: none !important;` — the `!important` defends
against Bandcamp's own inline `display: block` that re-asserts visibility
on player state changes.

**Why `.play-button` is broad enough on its own:**
Bandcamp's own play buttons across the surfaces we care about share the
`.play-button` class. The extension's own injected controls live inside
shadow-DOM hosts (`cueButton` mounts a `<span>` with `attachShadow({ mode: 'open' })`),
so a top-level CSS rule cannot reach inside them — the rule cannot match
the extension's Play / Queue buttons even though the cosmetic name overlaps.

### 3. Default-on without writing on first read

The content script reads `hideBandcampNativePlay` from
`browser.storage.local`. If `undefined`, treat as `true` (apply the hide).
We do **not** write `true` back on first read — that would needlessly
populate storage and obscure the "user has never touched this" state.

The options page does the same: a missing key renders the checkbox as
checked. The first explicit `setState` driven by the user writes a value.

### 4. Live updates via `storage.onChanged`

The content script subscribes to `browser.storage.onChanged` and, when
`hideBandcampNativePlay` changes, flips the injected `<style>` element's
`disabled` flag accordingly. No page reload required.

### 5. Module placement

A new file `packages/browser-extension/src/js/content/bandcamp/hide-native-play.js`
holds the selectors, the style-injection helper, and the storage subscription.
`inject.js` calls it once at startup, alongside the existing release-level
and feed injection passes. The module exports nothing the rest of the
content script needs — it self-installs and self-unsubscribes via its
lifecycle.

## Risks / Trade-offs

- **Bandcamp redesign changes the selectors** → Mitigation: the selectors
  are a single constant at the top of the module; we ship a one-line fix
  if needed. Worst case the buttons remain visible, which is the
  pre-change state — no functional regression beyond losing the hide.
- **`!important` over-broad** → The rule targets specific Bandcamp
  selectors only; it does not affect the extension's own injected buttons
  (which sit in shadow DOMs anyway).
- **User confusion: "where did the play button go?"** → Mitigation:
  the options page exposes the toggle with a clear label so a user who
  wants Bandcamp's native control back can re-enable it. We do not need
  in-page UI to explain it — the extension's own Play button is
  prominently placed in the same area.

## Open Questions

_(none — the simpler scope removes the prior open question about hook points.)_
