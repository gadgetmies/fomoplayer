---
id: 011
title: Rename "Queue" button to "Open queue"
status: todo
priority: P1
effort: S
created: 2026-05-04
depends-on: []
---

# Rename "Queue" button to "Open queue"

## Why

The label "Queue" is ambiguous — it could mean "open the queue" or "add
to the queue". The button opens the queue panel. Renaming it to
"Open queue" eliminates the ambiguity.

## What

- Change the button label in the player view from "Queue" to
  "Open queue".
- Update tooltips, aria-labels, and any other user-facing references for
  consistency.

## Acceptance criteria

- [ ] The button reads "Open queue" in the rendered player view.
- [ ] Tooltip and `aria-label` agree with the visible label.
- [ ] Test fixtures and snapshots that reference the label are updated.

## Code pointers

- `packages/browser-extension/` — player view component.
