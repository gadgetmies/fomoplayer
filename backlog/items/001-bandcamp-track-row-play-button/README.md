---
id: 001
title: Play button next to queue button on Bandcamp track rows
status: todo
priority: P1
effort: M
created: 2026-05-04
depends-on: []
---

# Play button next to queue button on Bandcamp track rows

## Why

Bandcamp track rows currently expose a queue button but no "play now"
affordance. To play a single track from a list, the user has to queue it and
then skip ahead manually. A dedicated play button speeds up triage and
matches user expectations from other listening UIs.

## What

- Add a play button to each Bandcamp track row, next to the existing queue
  button.
- Pressing it appends the selected track to the **end** of the queue and
  immediately starts playback of that track.

## Acceptance criteria

- [ ] A play button appears next to the queue button on every Bandcamp
      track row that already has a queue button.
- [ ] Clicking it appends the track to the end of the queue (does not
      replace the queue) and starts playback of that track.
- [ ] Visual style matches the queue button.

## Code pointers

- `packages/browser-extension/` — find the existing queue-button injection
  used on Bandcamp track rows; reuse its mounting / DOM-detection logic.
- The queue-append and "play track" APIs already used by the queue button.

## Out of scope

- Cover-image overlay controls — see item 003.
- Feed-page rows — see item 002.
