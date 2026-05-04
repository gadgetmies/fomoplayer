---
id: 014
title: Increase progress bar click area for easier seeking
status: todo
priority: P3
effort: S
created: 2026-05-04
depends-on: []
---

# Increase progress bar click area for easier seeking

## Why

The progress bar's clickable area is too thin to comfortably click,
especially on a trackpad. Skipping to a position requires precise
pointing, which is annoying day-to-day.

## What

- Increase the height of the clickable hitbox for the progress bar so
  seeking is easier.
- Visual height can stay similar; the clickable area should be larger
  (e.g. via a transparent padding wrapper around the visible bar).

## Acceptance criteria

- [ ] Hovering the progress bar shows a hit area visibly taller than
      the visible bar.
- [ ] Clicks anywhere within the expanded hit area seek to the
      corresponding position.
- [ ] The visible appearance of the progress bar is unchanged (or
      improved); no overlap with neighbouring controls.

## Code pointers

- `packages/browser-extension/` — player progress bar component.
