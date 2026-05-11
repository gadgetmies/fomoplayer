## Why

Selecting a cart today calls `GET /carts/:id` with no `offset`/`limit`, which means the frontend silently relies on the backend's default `limit: 200` — for any cart larger than 200 tracks it shows a truncated view the user has no way to grow, and even on smaller carts the first paint blocks on the entire payload. The main tracklist already paginates on scroll; the carts view should mirror that behaviour, both to make first paint cheap and to make the rest of the cart reachable.

## What Changes

- The frontend SHALL page the cart fetch and append rows as the user scrolls the carts table, mirroring the existing main-tracklist `hasMoreTracks` / `loadMoreTracks` shape.
- A per-cart pagination slice (`offset`, `limit`, `total`, `loadingMore`, `hasMore`) SHALL live alongside the existing main-tracklist pagination so the two cannot interfere.
- `hasMoreTracks()` and `loadMoreTracks()` in `App.js` SHALL handle the `carts` `listState` in addition to `new` / `heard` / `recent` / `search`.
- Switching carts SHALL reset the per-cart pagination slice (no leftover offset, no spurious `loadingMore`).
- Track rows returned by every track-fetching endpoint (`/me/tracks`, `/carts/<uuid>`, search) SHALL include a `carts` field — an array of `{ uuid }` objects, one per cart the track currently belongs to. This is the new authoritative source for the "in default cart" / "in cart X" badges in `Tracks.js` and `Player.js`. The legacy `cart.tracks?.find(id)` pattern is removed. Track rows SHALL NOT carry a singular `cart_id` field (a leftover from the old td CTE in `queryCartDetails`).
- The frontend's `updateDefaultCart` SHALL be removed entirely — once track rows carry `carts`, the default-cart membership is known without a separate fetch on app load.
- `GET /me/carts/default` SHALL act identically to `GET /me/carts/<uuid>` (and `GET /carts/<uuid>`), differing only in that it resolves the user's default-cart uuid server-side. Same response shape, same `offset`/`limit`/`store` semantics.
- After a `PATCH /carts/:id/tracks` add or remove, two state updates apply: (a) the affected cart's metadata (`track_count`, `store_details`, etc.) is merged from the response, and (b) the affected track's `carts` is updated in every state slice that references it (tracklist, search results, currently-viewed cart contents, queue) — appending `{ uuid }` on add, filtering it out on remove. The user's scroll position survives the edit because the cart's `tracks` array is no longer replaced wholesale.
- Backend changes are limited to the SQL queries that build track rows (`queryUserTracks`, `queryCartDetails`, `searchForTracks`) gaining a `carts` aggregation keyed by uuid, and the `/me/carts/default` route becoming a uuid-resolving alias.

## Capabilities

### New Capabilities

- `cart-tracks-pagination`: the carts table's paging behaviour — first-page fetch, infinite-scroll append, exhaustion detection, per-cart state isolation, and add/remove reconciliation that preserves scroll position.
- `track-cart-membership`: the cross-cutting "every track row knows which carts contain it" capability — what `cart_ids` carries, where it appears, how it's kept in sync after cart edits, and how the badges in `Tracks.js` / `Player.js` consume it.

### Modified Capabilities

- `user-tracks-query`: the canonical track-row shape returned by `queryUserTracks` gains a `cart_ids` field. The panel-ranking semantics are unchanged; only the per-row shape grows.

## Impact

- **Code (frontend)**:
  - `packages/front/src/App.js:832` (`selectCart`) — page the fetch and merge into the cart's `tracks` array on subsequent loads.
  - `packages/front/src/App.js:151` / `:165` (`hasMoreTracks` / `loadMoreTracks`) — handle the `carts` `listState`.
  - `packages/front/src/App.js:368` / `:378` / `:408` (`addToCart` / `removeFromCart` / `updateCart`) — reconcile the PATCH response by updating per-track `cart_ids` across every state slice; cart metadata is merged from the response.
  - `packages/front/src/App.js:411` (`updateDefaultCart`) — removed.
  - `packages/front/src/Tracks.js:542` / `:580`, `packages/front/src/Player.js:197` / `:259` / `:265` — replace `cart.tracks?.find(id)` membership scans with `track.cart_ids` lookups.
- **Code (backend)**:
  - `packages/back/routes/users/db.js` (`queryUserTracks`) — add a `cart_ids` aggregation per track row.
  - `packages/back/routes/shared/db/cart.js` (`queryCartDetails`) — same.
  - `packages/back/routes/shared/db/search.js` (`searchForTracks`) — same.
  - `packages/back/routes/users/api.js` (`/me/carts/default` handler) — resolve the user's default cart uuid and delegate to the same handler that serves `/me/carts/<uuid>` / `/carts/<uuid>`.
- **Page size**: one constant (`CART_TRACKS_PAGE_SIZE = 20`), matching the panel-tracklist limit.
- **Out of scope**: generalising the pagination plumbing into a shared hook (separate refactor), changes to cart sort order or filtering UI, and any server-side rate-limiting changes. The `track-cart-membership` capability covers cart-id membership only — richer per-track decoration (e.g. heard state, tags) is unchanged.
