---
id: 065
title: List screens for new / recent / heard with infinite query
effort: M
created: 2026-05-07
---

# List screens for new / recent / heard with infinite query

## Why

These three lists are the app's primary surface. They have to scroll
smoothly, paginate cleanly, and stay responsive while data loads.

## What

- A segmented control at the top of the Tracks tab toggles between
  New / Recent / Heard (replaces the web `/tracks/<state>` URL
  segment).
- Each segment renders a `FlatList` (or `FlashList`) backed by a
  TanStack Query `useInfiniteQuery` hooked into the appropriate
  endpoint.
- Pagination uses the same `limit` / cursor semantics as the web
  app (`packages/back/routes/index.js:40`
  `/api/tracks/`).
- Switching segments preserves scroll position per segment within a
  session.

## Acceptance criteria

- [ ] Smooth 60 fps scroll through ≥ 500 cached rows on a mid-tier
      device.
- [ ] Switching segments is instant (cached) and refetches in the
      background.
- [ ] First-load spinner replaced by a skeleton list (visually
      stable).
- [ ] Empty list shows an empty-state illustration + helpful copy.

## Code pointers

- `packages/front/src/Tracks.js:1` — current list rendering.
- `packages/front/src/App.js:456` — `updateTracks` + pagination
  logic to mirror.
