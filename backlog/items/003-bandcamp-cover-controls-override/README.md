---
id: 003
title: Route Bandcamp cover controls through extension player; add queue button
status: todo
priority: P2
effort: L
created: 2026-05-04
depends-on: []
---

# Route Bandcamp cover controls through extension player; add queue button

## Why

Bandcamp's native playback bypasses the extension's queue, heard tracking,
and player. With the extension installed, users expect a single playback
surface — anything they press on a Bandcamp page should play through the
extension player so the queue and heard state remain consistent.

## What

- Override the default playback functions invoked by Bandcamp's controls so
  playback runs through the extension's player instead of Bandcamp's native
  audio element. This covers the play button overlaid on the album cover
  image and the standard album-page play button.
- Add a **queue** button next to the play button in the controls overlaid
  on top of the album cover image.

## Acceptance criteria

- [ ] Clicking Bandcamp's native play (album page header, cover overlay)
      starts playback in the extension player; the page's own audio element
      does not play.
- [ ] A queue button appears next to the play button on the cover overlay
      and adds the track/release to the queue without starting playback.
- [ ] Heard status (item 007) and queue state remain consistent with
      playback initiated from these controls.

## Code pointers

- `packages/browser-extension/` — Bandcamp content scripts that hook
  playback.
- Bandcamp's `TralbumPlayer` (or current equivalent) and the page-level
  audio element. Investigate which hook point gives clean override
  semantics.

## Out of scope

- Track-row play button — see item 001.

## Open questions

- Cleanest hook point: replace the audio element, monkey-patch the player
  function, or wrap the underlying `TralbumPlayer`? Investigate before
  committing to an approach — Bandcamp's player implementation has shifted
  in the past.
