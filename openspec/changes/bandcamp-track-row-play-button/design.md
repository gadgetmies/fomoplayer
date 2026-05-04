## Context

The Fomo Player browser extension injects per-row controls into Bandcamp
release / track pages from
`packages/browser-extension/src/js/content/bandcamp/inject.js`. Today each
track row in `.track_table tr.track_row_view` gets two controls in this
order:

1. `Queue` (a `cueButton({ label: 'Queue', ... })`) which posts
   `bandcamp:enqueue` with a slimmed-down release containing only the
   chosen track.
2. `Add to Fomo Player` (a `renderCartButton(...)`) which opens the cart
   dropdown.

The supporting plumbing for "play this now" already exists:

- `bandcamp:enqueue` accepts a `playNow` flag, forwarded by the service
  worker as `audio:enqueue { playNow: true }`
  (`packages/browser-extension/src/js/service_worker.js:312-318`).
- `audio-player.js`'s `enqueue` already implements **append-and-play**
  when `playNow` is true: it computes `insertAt = state.queue.length`,
  concatenates the new tracks, sets `state.index = insertAt`, and calls
  `playCurrent()`. So the current queue contents are preserved.

The local working tree contains a draft of the per-row injection that
already adds a `Play` button before the `Queue` button using the same
`cueButton` factory and `releaseWithSingleTrack(release, trackId)` helper.
This change formalises that draft as a spec-backed change.

## Goals / Non-Goals

**Goals:**

- Add a per-row "Play" button to Bandcamp track rows on release / track
  pages, adjacent to the existing per-row "Queue" button.
- Add a release-level "Play" button on release / track page title
  sections (`Play release` / `Play track`) and on each discography
  grid tile (`Play`), adjacent to the existing release-level "Queue"
  button. The release-level Play appends the full release and starts
  from its first track.
- Reuse the existing `cueButton` factory so each new button inherits the
  Queue button's loading / error feedback (149c4b1b) for free; visual
  parity is automatic, not coincidental.
- Reuse the existing `bandcamp:enqueue` + `playNow: true` path — no new
  message types, no audio-player changes. With multi-track releases the
  existing audio-player semantics (`state.index = insertAt`) start
  playback from the first appended track, which is exactly what release-
  level Play needs.
- Keep injection idempotent under the existing MutationObserver loop in
  all three groups (per-row, title-section, discography tile).

**Non-Goals:**

- Changing the audio-player's enqueue semantics (append-and-play is
  already correct).
- Wiring "play now" into the cover-image overlay controls (item 003) or
  the discography / feed grids (items 002 / 003).
- Visual redesign of the per-row button group (covered by item 018 for
  vertical alignment and item 016 for cover-overlay restyling).

## Decisions

### Place the Play button **before** the Queue button

The natural reading order is "play this | queue this | add to a cart".
Putting `Play` first matches the order users scan in (left-to-right) and
keeps the most-impactful action closest to the track title. The local
draft already does this; we keep it.

Alternatives considered:

- _After Queue_ — closer to the cart control, but would split actions
  by destination (queue + cart together, single play off on the side).
  Rejected.

### Send `bandcamp:enqueue` with `playNow: true` rather than a new message

The service worker and audio player already handle this flag with
append-and-play semantics. Adding a new message type
(e.g. `bandcamp:play-now`) would duplicate logic and force a parallel
spec for the audio-player capability.

### Reuse the `cueButton` factory; don't introduce a separate component

`cueButton` is intentionally generic — it takes a label and an `onClick`
that returns `{ ok, error }`. The button's styling, spinner, error flash,
and re-entry guard all come from the factory. Reusing it means the new
button inherits the loading feedback added in 149c4b1b at no cost and
stays in sync with future per-row button changes.

### Track resolution stays in `extractTrackIdFromRow`

The existing helper already handles `rel="tracknum=N"`, the
`.track-number-col` text, and a title-match fallback. The Play button
uses the same resolution path so a row that can be queued can also be
played.

## Risks / Trade-offs

- **Risk:** The track row's own Bandcamp click handler can intercept
  clicks and navigate the page — the same class of bug fixed for the
  cart button in commit 2c8e93a6 / change
  `2026-05-04-fix-bandcamp-add-to-fp-row-navigation`.
  **Mitigation:** `cueButton`'s click handler already calls
  `e.preventDefault()` and `e.stopPropagation()`, and the button lives
  inside a shadow-DOM host inside the title cell. The Queue button
  shipped without regressions on the same row, so the Play button picks
  up the same isolation. Manual verification on a release with multiple
  tracks is still part of the task list.

- **Risk:** Track resolution (`extractTrackIdFromRow`) returns `null`
  for unusual table markup (compilations, hidden tracks), and the row
  is then skipped entirely.
  **Mitigation:** This is shared with the existing Queue button — if
  Queue fails, Play also fails, and the current behaviour (skip the
  row) is correct. No new failure mode is introduced.

- **Trade-off:** Two adjacent buttons add visual weight to each row.
  Item 018 already tracks vertical alignment of the per-row group; item
  016 tracks the cover-overlay restyle. We accept the temporary density
  and let those items refine it.
