---
id: 067
title: Track row component
effort: M
created: 2026-05-07
---

# Track row component

## Why

The same row appears in track lists, search results, cart detail, and
Now Playing's "up next". Building it once with consistent ergonomics
saves duplication.

## What

- Pure component taking a track + callbacks + a "context" prop
  (`'list' | 'cart' | 'search' | 'queue'`) to vary affordances.
- Renders: artwork thumbnail, artists, title, label, genres (chips),
  release date, score (small badge), store icons.
- Tap = play; long-press = action sheet (task 070).
- Heard / starred / in-cart visual states.
- Accessibility labels covering all visible information.

## Acceptance criteria

- [ ] Component renders identically in all four contexts with the
      right affordance set.
- [ ] Long text wraps cleanly at all dynamic-type sizes.
- [ ] Heard state is visually distinct without relying on colour
      alone (a11y).
- [ ] Renders a placeholder while artwork loads; final image swap
      is jank-free.

## Code pointers

- `packages/front/src/Track.js` — current web row.
- `packages/front/src/trackFunctions.js` — derived helpers
  (`trackArtistsAndTitleText`, etc.).
