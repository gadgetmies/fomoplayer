---
id: 075
title: Full-screen Now Playing
effort: M
created: 2026-05-07
---

# Full-screen Now Playing

## Why

The expanded player surfaces all controls and metadata at once and
gives a high-quality artwork view — what people open their phone
for when a track they love comes on.

## What

- Modal screen presented from the mini-player.
- Large artwork, full track info (artists, title, label, release,
  store icons), seek bar with scrubbing, prev / play-pause / next
  buttons, store-source toggle (which store's preview to play).
- Long-press menu (same as the row's, task 070).
- Swipe-down to dismiss back to mini-player.
- Up-next list inline (uses the row component in `'queue'`
  context).

## Acceptance criteria

- [ ] Open / dismiss animations are smooth (60 fps); spec-compliant
      gesture priorities.
- [ ] Scrubbing the seek bar is smooth and the audio follows
      release without audible glitches.
- [ ] Store toggle changes the active preview source without
      restarting the track-mark-heard cycle.
