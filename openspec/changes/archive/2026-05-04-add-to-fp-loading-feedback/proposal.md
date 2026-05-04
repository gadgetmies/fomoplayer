## Why

The "Add to Fomo Player" cart dropdown on Bandcamp fires a network round-trip
when the user picks a cart, but the picked row gives no in-flight feedback —
the popup just sits there until the worker responds. Users assume nothing
happened, click again, and end up with duplicate adds, unintended cart
membership, or anxious abandonment. The same gap will exist for the
remove-from-cart action introduced in item 009.

## What Changes

- While a cart-add request is in flight, the clicked cart row in the
  dropdown SHALL show a visible loading state (spinner / inline indicator)
  and SHALL NOT accept further clicks on the same row.
- On success, the clicked row SHALL show a brief success indication before
  the dropdown's existing close/refresh behaviour kicks in.
- On failure, the row SHALL show an error indication and remain clickable so
  the user can retry without reopening the dropdown.
- The same in-flight / success / error treatment SHALL apply to the
  remove-from-cart action introduced in item 009 (clicking an
  already-in-cart entry).
- The "create new cart and add" path (the `+` button next to the new-cart
  input) SHALL share the same in-flight, success, and error feedback so the
  user gets consistent affordance regardless of which entry point they used.

## Capabilities

### New Capabilities
<!-- none — extending an existing capability -->

### Modified Capabilities
- `bandcamp-track-actions`: add requirements for in-flight, success, and
  error feedback on the cart dropdown's add, remove (item 009), and create-
  and-add interactions.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/cart-button.js` — the
  shadow-DOM cart dropdown that owns the add / create / remove click
  handlers and the existing `setStatus` text. This is the only file that
  needs to change for the UI behaviour.
- No backend, service-worker, or message-protocol changes; the existing
  `bandcamp:add-to-cart` / `bandcamp:create-cart` responses already carry
  enough information (`ok`, `error`) to drive the feedback.
- No new permissions, dependencies, or build steps.
