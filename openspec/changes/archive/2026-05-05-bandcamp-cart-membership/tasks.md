## 1. Annotate `bandcamp:get-carts` with per-cart membership

- [x] 1.1 In `packages/browser-extension/src/js/service_worker.js`, change the `bandcamp:get-carts` handler to read `message.releases` (default `[]`).
- [x] 1.2 If `releases` is empty, keep the current behaviour — return `{ ok: true, carts }` with no annotation.
- [x] 1.3 If `releases` is non-empty, resolve them to FP track IDs via `buildQueueItemsFromReleases(message.releases)`. Build `requestedIds = new Set(items.map(i => i.fomoplayerTrackId).filter(Boolean))`.
- [x] 1.4 Run `Promise.all` over `getUserCarts()` to fetch each cart's detail (`apiFetch('/api/me/carts/' + cart.id)`), collect the cart's track IDs, and compute `containsTrackIds = cart.tracks.filter(t => requestedIds.has(t.id)).map(t => t.id)`.
- [x] 1.5 Return `{ ok: true, carts: cartsWithContainsTrackIds }`.

## 2. Render membership in the dropdown

- [x] 2.1 In `packages/browser-extension/src/js/content/bandcamp/cart-button.js`, extend `loadCarts` to send `bandcamp:get-carts { releases: await getReleases() }` instead of the bare message. Continue to handle a missing or empty `releases` reply gracefully (treat as not-in-cart).
- [x] 2.2 Extend `makeRow` to accept `containsTrackIds: number[]`. When the array is non-empty, set the row's idle icon to a new `MINUS_ICON` SVG and add a CSS class (or toggle a `data-membership="in-cart"` attribute) that tints the row's idle background `#eef5ff`. When empty, keep `PLUS_ICON` and the existing idle background.
- [x] 2.3 In the row click handler, branch on `row.containsTrackIds.length`:
  - empty → existing `runAdd` path (`bandcamp:add-to-cart { cartId, releases }`).
  - non-empty → new `runRemove` path that issues `bandcamp:remove-from-cart { cartId, trackIds: row.containsTrackIds }`, drives the same `setRowState` lifecycle, and on success replaces `row.containsTrackIds = []` and re-renders the idle visual.
- [x] 2.4 In `runAdd`'s success branch, instead of closing the dropdown, update `row.containsTrackIds` to the FP track IDs that came back from the worker (extend the `bandcamp:add-to-cart` response to include `addedTrackIds: number[]` so the row can know exactly which IDs went in), call `setRowState('idle')` after a brief success flash, and leave the popup open. Update the worker's `bandcamp:add-to-cart` handler accordingly to return `{ ok: true, addedCount, addedTrackIds }`.
- [x] 2.5 Add a small `MINUS_ICON` SVG constant alongside the existing `CART_ICON` / `PLUS_ICON` / `CHECK_ICON` / `WARN_ICON` icons in `cart-button.js`.

## 3. Manual verification

- [ ] 3.1 Build (`yarn build:chrome`) and reload the extension. _(build verified; live reload pending the user)_
- [ ] 3.2 On a Bandcamp release whose track is already in cart X but not cart Y, open the per-track dropdown — confirm cart X's row shows the in-cart icon / tint, cart Y's row stays default.
- [ ] 3.3 Click the in-cart cart X row — confirm the row spins, settles, and flips to the not-in-cart state, and the dropdown stays open. Verify on the Fomo Player web UI that the track is gone from cart X.
- [ ] 3.4 Click the (now not-in-cart) cart X row — confirm it adds the track back, the row spins, settles, and flips to the in-cart state. Verify on the web UI.
- [ ] 3.5 Repeat 3.3 with the network forced offline — confirm the row shows the error indication with an inline message and is retryable.
- [ ] 3.6 Open the dropdown for a multi-track release: confirm carts that hold any of the release's tracks render in-cart and clicking them removes only the in-cart subset.

## 4. Wrap-up

- [x] 4.1 Run `openspec validate bandcamp-cart-membership --strict`.
- [x] 4.2 Update `backlog/items/009-add-to-fp-shows-current-carts/notes.md` with a session-log entry.
- [x] 4.3 Commit (single commit covering service_worker.js + cart-button.js + the openspec change directory + backlog updates) and move backlog item 009 to **Done** in `backlog/INDEX.md`.
