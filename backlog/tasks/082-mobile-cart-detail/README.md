---
id: 082
title: Cart detail + swipe-to-remove + mark-purchased
effort: M
created: 2026-05-07
---

# Cart detail + swipe-to-remove + mark-purchased

## Why

The cart detail screen is where users curate before buying.
Removing tracks and marking purchased need to be fast on touch.

## What

- Cart detail screen renders the cart's tracks with the row
  component (in `'cart'` context).
- Swipe-left → remove from cart (optimistic, undoable).
- Long-press → mark purchased / unpurchased + the standard row
  action menu.
- Header shows cart name, track count, total duration if
  available.
- Tapping a row plays the track in the queue context of the cart.

## Acceptance criteria

- [ ] Removing a track is instant in UI; rolls back on backend
      error.
- [ ] Mark purchased flow is reversible without leaving the
      screen.
- [ ] Playing from a cart establishes the cart as the queue.

## Code pointers

- `packages/back/routes/users/api.js:369` — patch cart tracks.
- `packages/back/routes/users/api.js:386` — mark purchased.
