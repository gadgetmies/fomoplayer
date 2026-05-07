## Why

Today the "Add to Fomo Player" dropdown opened next to a Bandcamp
track is a one-way affordance: it lists the user's carts and the user
picks one to add the track. Users have no way to see, from the
Bandcamp page, which carts already contain that track — so they
double-add by accident, hesitate before clicking ("did I do this
already?"), and otherwise lose flow. Worse, the only way to undo a
mistaken add is to leave the page entirely and visit Fomo Player to
remove the track. A symmetric add-and-remove control next to each
cart row makes the dropdown a single surface for cart membership.

## What Changes

- Extend the `bandcamp:get-carts` worker handler so it accepts an
  optional `releases` payload. When present, the handler resolves
  the releases to Fomo Player track IDs (using the existing
  `buildQueueItemsFromReleases` ingest path) and returns each cart
  annotated with `containsTrackIds` — the subset of the requested
  track IDs that the cart currently holds. When `releases` is
  omitted, the handler keeps its current behaviour (no annotation).
- Update the cart dropdown to send `releases` when it opens, so
  the response identifies which carts already contain the current
  release's tracks.
- Render in-cart rows with a distinct visual treatment (a
  "remove from cart" icon in place of the cart-add icon, and a
  muted background tint that signals "already in").
- Wire in-cart row clicks to send `bandcamp:remove-from-cart` with
  the in-cart `trackIds`. The remove path already exists in the
  worker; the row's loading / success / error lifecycle reuses
  `setRowState` and the `pending` re-entry guard from item 010.
- After a successful remove or add, the row flips state in place
  (in-cart ↔ not-in-cart) without closing the dropdown, so the user
  can immediately act on another cart in the same session.

## Capabilities

### New Capabilities
<!-- none — extending bandcamp-track-actions -->

### Modified Capabilities
- `bandcamp-track-actions`: extend the cart dropdown's requirements
  with cart-membership display, click-to-remove for in-cart rows,
  and in-place state flip after a successful add or remove.

## Impact

- `packages/browser-extension/src/js/service_worker.js`:
  - `bandcamp:get-carts` accepts optional `releases`; when present,
    resolves them to FP track IDs via the existing ingest path,
    fetches `/api/me/carts/:id` per cart, and annotates each cart
    with `containsTrackIds: [...]`.
- `packages/browser-extension/src/js/content/bandcamp/cart-button.js`:
  - `loadCarts()` now passes `releases: await getReleases()`
    alongside the message.
  - `makeRow` accepts the `containsTrackIds` for the row and renders
    the in-cart visual treatment plus a "remove from cart" tooltip
    when the array is non-empty.
  - The row click handler dispatches add or remove based on
    `containsTrackIds` length and updates the row's annotation in
    place after settle.
- No backend, message-protocol breaking changes; the new field on
  `bandcamp:get-carts` response is additive.
- No new permissions, dependencies, or build steps.
