---
id: 072
title: Queue model + prev/next + auto-skip on missing preview
effort: M
created: 2026-05-07
---

# Queue model + prev/next + auto-skip on missing preview

## Why

The web `Player.js` already has the right semantics: pull tracks
from the visible list, prefer previews from the user's enabled
stores, skip tracks with no usable preview. Mirror it on mobile.

## What

- Queue is the visible track list at play time (per
  `Player.js:149`).
- `next()` advances the index; if the next track has no preview
  from any of the user's enabled stores, advance again until one
  is found or the queue is exhausted.
- `prev()` does the symmetric thing.
- Store preference order is configurable in Settings (story 047);
  read it from the user's settings cache.
- Queue updates as the underlying list updates (e.g. new tracks
  fetched while playing).

## Acceptance criteria

- [ ] `next` from the last track stops playback gracefully.
- [ ] Tracks with no enabled-store preview are silently skipped.
- [ ] Reordering / refreshing the underlying list does not crash
      the player or lose the current track's position.
- [ ] Behaviour matches `packages/front/src/Player.js:149` for the
      same input.
