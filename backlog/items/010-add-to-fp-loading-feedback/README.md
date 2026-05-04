---
id: 010
title: Loading and success feedback for "Add to Fomo Player"
status: done
priority: P1
effort: S
created: 2026-05-04
depends-on: []
---

# Loading and success feedback for "Add to Fomo Player"

## Why

Cart-add requests can take a moment over the network. Without visible
feedback, users click again (causing duplicate adds or UI confusion) or
assume the action failed and give up.

## What

- Show a clear loading state on the button or row while a cart-add
  request is in flight.
- Show a success indication when it completes.
- Show a recoverable error message if it fails.

## Acceptance criteria

- [ ] Clicking add-to-cart triggers a visible loading indicator on the
      button/row immediately.
- [ ] On success, a clear success state replaces the loading indicator.
- [ ] On error, the user sees an error message and can retry.
- [ ] The same feedback applies to remove-from-cart actions introduced
      in item 009.

## Code pointers

- `packages/browser-extension/` — "Add to Fomo Player" button and
  surrounding control.
