---
id: 086
title: Follows list (artists / labels / playlists)
effort: M
created: 2026-05-07
---

# Follows list (artists / labels / playlists)

## Why

Users need a way to see and curate their follows on mobile.
Without it they can't trim the noise that drives their New list.

## What

- Tabs / segmented control: Artists · Labels · Playlists.
- Each tab is a list of follows grouped by store (or sortable).
- Swipe-left → unfollow (with undo).
- Tap the star to elevate / un-elevate.
- Tap a row → opens the entity's track listing (or store URL).
- Search-within-follows for users with hundreds of follows.

## Acceptance criteria

- [ ] Each tab loads, paginates if necessary, and reflects backend
      state.
- [ ] Unfollow is optimistic; rolls back on error.
- [ ] Star toggle round-trips through the
      `PUT /api/follows/:type/:id` endpoint.
- [ ] Search-within-follows is responsive on lists of ≥ 500 items.

## Code pointers

- `packages/back/routes/users/api.js:276` — list followed
  artists.
- `packages/back/routes/users/api.js:286` — labels.
- `packages/back/routes/users/api.js:296` — playlists.
- `packages/back/routes/users/api.js:312` — star toggle.
