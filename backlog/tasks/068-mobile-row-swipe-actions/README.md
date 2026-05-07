---
id: 068
title: Per-row swipe actions (cart + heard)
effort: M
created: 2026-05-07
---

# Per-row swipe actions (cart + heard)

## Why

The two most common positive actions — add to default cart, mark
heard — should be one-handed swipes. Scrolling and tapping a long-press
menu for the high-frequency operation feels heavy.

## What

- Right-swipe → add track to default cart, with snackbar undo.
- Left-swipe → toggle heard state, optimistic, idempotent.
- Direction conventions are configurable in case a/b testing
  flips them; defaults match the convention chosen here.
- Both actions are optimistic via TanStack Query mutation with
  rollback on error.
- Swipe gestures coexist with the parent list's vertical scroll —
  use `react-native-gesture-handler` `Swipeable` (or
  `react-native-reanimated`-based equivalent) with proper
  pan-gesture priorities.
- Action invalidates the relevant list queries (e.g. heard moves
  the row from "new" to "heard" on the next refetch).

## Acceptance criteria

- [ ] Right-swipe past threshold adds to default cart; cart
      counter updates immediately.
- [ ] Left-swipe past threshold marks heard; row visually updates.
- [ ] Snackbar undo restores the previous state.
- [ ] Mid-swipe scroll cancels the swipe cleanly (no stuck rows).
- [ ] Action errors roll back the optimistic state and show a
      toast.

## Code pointers

- `packages/front/src/Track.js` — web row's button affordances for
  the same actions.
- Backend: `PATCH /api/tracks/` (heard) and
  `PATCH /api/carts/:id/tracks` (cart).
