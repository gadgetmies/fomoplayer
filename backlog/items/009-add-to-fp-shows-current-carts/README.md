---
id: 009
title: "'Add to Fomo Player' carts list shows current membership; click to remove"
status: todo
priority: P2
effort: M
created: 2026-05-04
depends-on: []
---

# "Add to Fomo Player" carts list shows current membership; click to remove

## Why

Users currently have no way to see which Fomo Player carts a Bandcamp
track is already in from the Bandcamp page itself. This leads to
duplicate-add attempts and surprise. Letting users remove from the same
control gives a symmetric, single-surface flow.

## What

- The carts list inside the "Add to Fomo Player" button's dropdown
  should display which Fomo Player carts the track is **already** in.
- Clicking one of those existing-membership entries removes the track
  from that cart.
- Clicking a not-yet-in-cart entry continues to add the track (existing
  behaviour).

## Acceptance criteria

- [ ] Opening the dropdown for a track that is in carts X and Y shows X
      and Y visually marked as current.
- [ ] Clicking on an already-in-cart entry removes the track from that
      cart and updates the dropdown's state without closing it.
- [ ] Clicking a not-yet-in-cart entry adds the track and updates the
      dropdown's state in the same way.
- [ ] Loading and error states for both add and remove are visible (see
      item 010).

## Code pointers

- `packages/browser-extension/` — the "Add to Fomo Player" dropdown
  component.
- Backend cart-membership endpoints used by the web UI.

## Open questions

- Does click-to-remove need an undo, or is the visible state change
  enough? Probably enough given the dropdown shows current state and a
  re-add is one click away.
