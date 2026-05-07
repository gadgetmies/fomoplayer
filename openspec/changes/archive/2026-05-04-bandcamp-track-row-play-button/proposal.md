## Why

Bandcamp track rows on a release page expose a "Queue" button (and an
"Add to Fomo Player" cart control) but no way to say "play this one now".
To audition a single track from a tracklist, the user has to queue it and
then skip ahead manually — fine when the queue is empty, awkward and slow
when there's already a queue you don't want to disturb. A dedicated "play
now" affordance speeds up triage and matches the expectation set by every
other listening UI.

## What Changes

- Inject a "Play" button next to the existing per-row "Queue" button on
  every Bandcamp track row that already gets a Queue button (release pages
  and single-track pages where the track table renders).
- Inject a release-level "Play" button next to the existing release-level
  "Queue" button:
  - In the **title section** of release pages (`Play release`) and
    single-track pages (`Play track`).
  - On each tile of the **discography grid** (`Play`).
- Clicking a per-row "Play" SHALL append that single track to the end of
  the current queue and immediately start playing it.
- Clicking a release-level "Play" SHALL append every track of that
  release to the end of the queue in source order and immediately start
  playing from the first appended track.
- In all cases the action MUST NOT replace or reorder existing queue
  contents and MUST NOT navigate the page.
- Each Play button shares the visual style and loading / error feedback
  lifecycle of the Queue button it sits next to, so each group reads as
  a single visual unit.
- Injection MUST stay idempotent under the existing MutationObserver
  reinjection loop — adding the new buttons MUST NOT cause double-
  injection or visual jitter on either the title section, track rows,
  or discography tiles.

## Capabilities

### New Capabilities
<!-- none — extending the existing bandcamp-track-actions capability -->

### Modified Capabilities
- `bandcamp-track-actions`: add a requirement that per-row track injection
  exposes a "Play" button which appends to and plays from the end of the
  queue, alongside the existing "Queue" and "Add to Fomo Player" controls.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/inject.js`:
  - `injectReleaseLevelButtons` — per-row group gains a `Play` button
    before the existing `Queue` button (already present locally as an
    uncommitted draft).
  - `injectReleaseLevelButtons` — title-section group gains
    `Play ${releaseLabel}` before `Queue ${releaseLabel}`, sending
    `bandcamp:enqueue` for the whole release with `playNow: true`.
  - `injectDiscographyButtons` — each tile gains a `Play` button
    before `Queue`, fetching the release via `fetchReleaseTralbum` then
    sending the same enqueue + playNow call.
  - All three reuse the `cueButton` factory.
- No service-worker, audio-player, or message-protocol changes required:
  `bandcamp:enqueue` already accepts `playNow: true`, and `audio-player.js`
  already implements append-then-play semantics for that flag
  (`packages/browser-extension/src/js/audio-player.js`, the `enqueue`
  function).
- Out of scope here (covered by other backlog items):
  - Feed-page rows — item 002.
  - Cover-image overlay controls — item 003.
  - "Add to Fomo Player" cart membership and click-to-remove — item 009.
- No new permissions, dependencies, or build steps.
