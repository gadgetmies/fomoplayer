## ADDED Requirements

### Requirement: Cart selection fetches one page, not the entire cart

When the user selects a cart, the frontend SHALL fetch a single page of that cart's tracks via `GET /carts/:id?offset=0&limit=<CART_TRACKS_PAGE_SIZE>` and use the response's top-level `track_count` as the cart's authoritative total. The legacy unparametered call (`GET /carts/:id` with neither `offset` nor `limit`) SHALL no longer be used by the frontend, so carts larger than the backend's default `limit: 200` no longer silently truncate.

`CART_TRACKS_PAGE_SIZE` SHALL be a frontend-side constant whose value matches the existing panel tracklist's per-category limit (currently `20`) so the carts view paginates at the same cadence as the rest of the app. The constant MUST be reused for first-page and load-more so they cannot drift.

#### Scenario: Cart with fewer tracks than the page size

- **WHEN** the user selects a cart whose `track_count` is strictly less than `CART_TRACKS_PAGE_SIZE`
- **THEN** one fetch resolves with all the cart's tracks
- **AND** the cart view's `hasMore` flag is `false`
- **AND** no loading-more indicator is shown at the bottom of the table

#### Scenario: Cart with many more tracks than the page size

- **WHEN** the user selects a cart whose `track_count` is, say, 5,000
- **THEN** the first fetch returns the first `CART_TRACKS_PAGE_SIZE` tracks
- **AND** the cart view's `hasMore` flag is `true`
- **AND** the table can scroll all the way through the remaining 4,900 tracks via subsequent loads

### Requirement: Scrolling near the bottom loads the next page

When the user scrolls the cart table such that the existing infinite-scroll trigger fires (the same trigger the main tracklist uses), the frontend SHALL request the next page via `GET /carts/:id?offset=<count>&limit=<CART_TRACKS_PAGE_SIZE>` and append the returned tracks to the cart's in-memory `tracks` array. While the request is in flight, the existing "loading more" indicator at the bottom of the tracks table SHALL be visible. When `offset + count >= track_count`, `hasMore` SHALL flip to `false` and no further fetches SHALL fire even if the user keeps scrolling.

#### Scenario: User scrolls into the second page

- **WHEN** the user has scrolled to the bottom of the first page of a multi-page cart
- **AND** the infinite-scroll trigger fires
- **THEN** a single `GET /carts/:id?offset=<page-size>&limit=<page-size>` request goes out
- **AND** the loading-more indicator is visible until that request resolves
- **AND** the response's tracks are appended to the existing `tracks` array (not replaced)
- **AND** the cart view's running `count` increases by the number of tracks returned

#### Scenario: User scrolls past the last page

- **WHEN** the cart's running `offset + count >= track_count`
- **AND** the user keeps scrolling
- **THEN** no further `GET /carts/:id` request is fired
- **AND** the loading-more indicator is not shown

### Requirement: Switching carts resets the pagination cursor

When the user switches from one cart to another, the per-cart pagination cursor (`offset`, `count`, `total`, `loadingMore`, `hasMore`) SHALL reset to its first-page state for the new cart. No leftover offset, no spurious `loadingMore`, no stale `total` from the previous cart SHALL appear in the new cart's view.

The previously-visited cart's tracks snapshot in `state.carts` MAY be retained as the initial paint when the user navigates back to it, but the cursor SHALL re-reset to first-page on the back-navigation and a fresh first-page fetch SHALL replace the snapshot when it resolves.

#### Scenario: User has scrolled through three pages of cart A then selects cart B

- **WHEN** the user has loaded 300 tracks across three pages of cart A
- **AND** then selects cart B
- **THEN** cart B's view starts at `offset=0` with `count = <cart B first page length>` and `total = <cart B track_count>`
- **AND** no "loading more" indicator from cart A's last fetch carries over
- **AND** the next `loadMoreTracks` call requests cart B's second page, not cart A's fourth

### Requirement: Adding or removing a track preserves scroll position

When the user adds or removes a track via `PATCH /carts/:id/tracks` while the affected cart is currently displayed (paged), the frontend SHALL update the cart's in-memory `tracks` array via in-place splice rather than wholesale replacement, so the user's current scroll position survives the edit. The PATCH response's `track_count` and other top-level cart metadata (`name`, `is_public`, `store_details`) SHALL be merged onto the cart record without touching the running `tracks` array. The companion membership update — patching every visible copy of the affected track's `cart_ids` — is owned by the `track-cart-membership` capability.

For an `add`, the new track row SHALL be inserted at the position the cart's ordering implies (currently `track__cart_added DESC`, so at the top). For a `remove`, the matching track id SHALL be spliced out wherever it sits in the in-memory array; if the removed track is not currently in memory (because it lives in a not-yet-loaded later page), the splice SHALL be a no-op for `tracks` but `total` SHALL still be updated from the PATCH response.

#### Scenario: Add reflects in the visible rows without scroll loss

- **WHEN** the user has scrolled into the second page of a cart
- **AND** clicks "add to cart" for a track
- **THEN** the cart's `tracks` array gains one entry (the newly-added track) without being replaced wholesale
- **AND** the user's scroll position does not jump to the top
- **AND** the cart's `total` is updated from the PATCH response's `track_count`

#### Scenario: Remove of an in-memory track reflects in the visible rows

- **WHEN** the user removes a track that is in the currently-loaded page
- **THEN** that track is spliced out of the `tracks` array
- **AND** the user's scroll position is preserved
- **AND** the cart's `total` is decremented (sourced from the PATCH response, not computed locally)

#### Scenario: Remove of a not-yet-loaded track updates total without splicing

- **WHEN** the user removes a track that is not in the currently-loaded `tracks` array (it lives in a later, not-yet-paged page)
- **THEN** the in-memory `tracks` array is unchanged
- **AND** the cart's `total` decreases by 1 (sourced from the PATCH response)
- **AND** the next `loadMoreTracks` call's response naturally reflects the missing row

### Requirement: `/me/carts/default` is a uuid-resolving alias

`GET /me/carts/default` SHALL behave identically to `GET /me/carts/<uuid>` (and `GET /carts/<uuid>`) for the user's default cart, modulo resolving the uuid server-side. Same response shape, same `offset` / `limit` / `store` query semantics, same `cart_ids`-on-each-track invariants. The `'default'` literal SHALL exist only as a route-level alias; the underlying `getCartDetails` / `queryCartDetails` path SHALL operate exclusively on resolved uuids.

#### Scenario: Default-cart fetch and uuid-cart fetch return identical shapes

- **WHEN** the user's default cart has uuid `<X>`
- **AND** the client requests `GET /me/carts/default?offset=0&limit=20`
- **AND** the same client requests `GET /me/carts/<X>?offset=0&limit=20`
- **THEN** the two responses are byte-equivalent (same `id`, `uuid`, `track_count`, `tracks` array, `cart_ids` per track, `store_details`)

#### Scenario: 'default' is not a valid cart-id at the SQL layer

- **WHEN** any function in `packages/back/routes/shared/db/cart.js` is called with a `cartId` argument
- **THEN** that argument is a numeric or uuid value, never the literal string `'default'`

### Requirement: Cart pagination state is independent of the main-tracklist pagination

The cart view's pagination cursor SHALL live in a separate state slice from the main tracklist's `pagination` (which is keyed by panel — `new`, `heard`, `recent`). Loading more carts SHALL NOT fire `loadMoreTracks` for the main tracklist, and vice versa. The two `loadingMore` indicators are conceptually distinct and MUST NOT collide; the carts view's `loadingMore` is owned by the cart cursor, and the tracks view's `loadingMore` continues to be owned by the existing per-panel pagination.

#### Scenario: Main-tracklist behaviour is unchanged

- **WHEN** the user is on the `new`, `heard`, `recent`, or `search` listState
- **THEN** `hasMoreTracks` and `loadMoreTracks` behave exactly as they did before this change
- **AND** the main-tracklist `pagination` state slice is not read or written by any cart code path

#### Scenario: Cart loadMore does not affect the main tracklist

- **WHEN** a `loadMoreTracks` call fires while the user is on the carts listState
- **THEN** no `GET /me/tracks/...` request goes out
- **AND** the main-tracklist `pagination` state slice is unchanged
