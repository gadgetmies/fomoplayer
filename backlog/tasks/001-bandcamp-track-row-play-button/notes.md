# Notes

## Decisions

- Place each new `Play` button **before** the `Queue` button in its
  injected button group so the natural left-to-right reading order is
  "play this | queue this | add to a cart". Most-impactful action sits
  closest to the track title / cover.
- Reuse the existing `cueButton` factory in
  `packages/browser-extension/src/js/content/bandcamp/inject.js` rather
  than introducing a new component — this gives every new button the
  same shadow-DOM styling, loading state, error flash, and re-entry
  guard the Queue button already has (149c4b1b), and keeps the buttons
  in sync if the per-row / per-release treatment evolves.
- Reuse the existing `bandcamp:enqueue` worker message with
  `playNow: true`. The service worker (`service_worker.js`) already
  forwards `playNow` to `audio:enqueue`, and `audio-player.js`'s
  `enqueue` already implements append-then-play
  (`state.queue.concat(tracks)` → `state.index = insertAt` →
  `playCurrent()`). For multi-track releases this means the first
  appended track becomes active — exactly what `Play release` needs.
  No new message types or audio-player changes are required.
- Extend the change to cover the **release-level** injection too:
  - Title section on release / track pages: `Play release` / `Play track`
    next to the existing `Queue release` / `Queue track`.
  - Discography grid: `Play` next to the existing `Queue` on each tile.
  Originally only per-row was specced; broadened during /opsx:apply on
  user request because release-level Play has the same conceptual
  utility as Queue at that level. Discography uses `getReleases()` →
  `fetchReleaseTralbum(href)` to load the release on click, identical
  to the existing Queue path but with `playNow: true`.

## Rejected approaches

- _Place Play after Queue._ Keeps Queue + Cart adjacent but splits "play
  now" off to one side; rejected as worse for scannability.
- _Add a dedicated `bandcamp:play-now` message type._ Would duplicate
  the audio-player's existing append-and-play path and force a parallel
  spec; rejected.

## Open threads

_(none — feed-page rows tracked separately as item 002, cover-image
overlay tracked as item 003.)_

## Session log

### 2026-05-04

- Drafted the per-row Play button locally (uncommitted) before the spec
  work — `inject.js` already contains the `cueButton({ label: 'Play', ... })`
  block before the existing `Queue` block; behaviour matches spec.
- Wrote OpenSpec change `bandcamp-track-row-play-button` (proposal,
  design, specs delta against `bandcamp-track-actions`, tasks).
- `node --check` on `inject.js` passes. The full extension build
  (`yarn build:chrome`) requires `FRONTEND_URL` to be set in the
  environment — left to the user's normal dev setup, deliberately not
  defaulted (per project CLAUDE.md "No deployment domains in source
  code").

### 2026-05-05

- Per user request, broadened the change to also cover release-level
  injection. Added in `inject.js`:
  - Title section: `cueButton({ label: \`Play ${releaseLabel}\`, ... })`
    before the existing `Queue ${releaseLabel}` button, sending
    `bandcamp:enqueue` with `releases: [release], playNow: true`.
  - Discography grid: `cueButton({ label: 'Play', ... })` before the
    existing `Queue` button, awaiting `getReleases()` and sending
    `releases, playNow: true`.
- Updated proposal, design, specs delta, and tasks.md to match.
  `openspec validate` passes; `node --check inject.js` passes.
- Pending: user-driven verification of build, load, and in-browser
  behaviour on a multi-track Bandcamp release page, single-track page,
  and discography page (tasks 3.1–3.10). Not committing until that is
  confirmed (per memory `feedback_verify_before_commit`).
