---
id: 012
title: Move clear-queue button into queue list and require confirmation
status: done
priority: P1
effort: S
created: 2026-05-04
depends-on: []
---

# Move clear-queue button into queue list and require confirmation

## Why

The clear-queue (`X`) button is currently right next to the "Open queue"
button, which makes it easy to misclick. Worse, clicking it clears the
queue without confirmation — users have lost queues to a fat-finger
click.

## What

- Move the clear-queue (`X`) button **into the queue list** itself
  (i.e. it lives inside the queue panel, not next to the queue-open
  button).
- Pressing it must show a confirmation prompt before clearing.

## Acceptance criteria

- [ ] The clear-queue button is no longer adjacent to the "Open queue"
      button in the player view.
- [ ] The clear-queue button is visible inside the queue list view.
- [ ] Clicking it shows a confirmation prompt; the queue is only cleared
      after the user confirms.
- [ ] Cancelling the prompt leaves the queue intact.

## Code pointers

- `packages/browser-extension/` — player view (current location of `X`)
  and queue list view (new home).

## Out of scope

- Undo after clearing — confirmation is enough for this item.
