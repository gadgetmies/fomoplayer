## 1. State + constant

- [x] 1.1 Introduce `CART_TRACKS_PAGE_SIZE = 20` (matching the panel-tracklist's per-category limit) co-located with the cart code in `packages/front/src/App.js`. Use it for both first-page and load-more.
- [x] 1.2 Add a `cartPagination: { offset, count, total, loadingMore }` slice to `App` state, distinct from the existing main-tracklist `pagination` slice. Initial value `null` (no cart selected).

## 2. selectCart — first-page fetch

- [x] 2.1 Update `selectCart(uuid, filter)` in `App.js:832` to call `/carts/${uuid}?offset=0&limit=${CART_TRACKS_PAGE_SIZE}${filter ? `&${filter without leading ?}` : ''}`. Confirm the existing `filter` parameter (if any callers pass one) is composed correctly with the new query params.
- [x] 2.2 On response, set `cartPagination = { offset: 0, count: response.tracks.length, total: response.track_count, loadingMore: false }`. Replace the cart record in `state.carts` (not just merge `tracks`) — `selectCart` is a fresh-selection event.
- [x] 2.3 Confirm the existing `fetchingCartDetails` flag is still set/cleared correctly so the first-paint spinner UX is unchanged.

## 3. hasMoreTracks / loadMoreTracks — cart branch

- [x] 3.1 Extend `hasMoreTracks()` (`App.js:151`) with a `listState === 'carts'` branch that returns `cartPagination ? cartPagination.offset + cartPagination.count < cartPagination.total : false`.
- [x] 3.2 Extend `loadMoreTracks()` (`App.js:165`) with a `listState === 'carts'` branch that, if not already `loadingMore` and `hasMoreTracks()` is true, sets `cartPagination.loadingMore = true`, fires `GET /carts/${selectedCartUuid}?offset=${count}&limit=${CART_TRACKS_PAGE_SIZE}`, appends `response.tracks` to the selected cart's `tracks`, and updates `cartPagination` to `{ offset: 0, count: count + response.tracks.length, total: response.track_count, loadingMore: false }`. (`offset` stays 0 because `count` already encodes the running running progress; alternatively, encode offset as `offset + count` per page if that reads more naturally to the implementer — pick one and be consistent.)
- [x] 3.3 Verify the existing `new` / `heard` / `recent` / `search` branches are untouched and behave exactly as before.

## 4. addToCart / removeFromCart — in-place reconcile

- [x] 4.1 Replace `updateCart(cartDetails)` (`App.js:408`) with (or alongside, if other callers depend on it) a `mergeCartDetailsPreservingTracks(cartDetails, { addedTrackId, removedTrackId })` helper that updates `name`, `is_public`, `is_default`, `is_purchased`, `store_details`, and `track_count` on the existing cart record without replacing `tracks`. Splice the added or removed track id into / out of `tracks`.
- [x] 4.2 Wire `addToCart(cartId, trackId)` (`App.js:368`) to use the new merge helper. The PATCH response's first-page `tracks` array contains the new track at the top — extract that one row, splice it into the in-memory `tracks` at the front, and bump `cartPagination.count` and `cartPagination.total` from the response.
- [x] 4.3 Wire `removeFromCart(cartId, trackId)` (`App.js:378`) to use the new merge helper. Splice the removed track id out of `tracks` if present; update `cartPagination.total` from the PATCH response regardless.
- [x] 4.4 Confirm `onMarkPurchased` (`App.js:388`) — which calls `selectCart(this.state.selectedCartUuid)` after PATCHing — still works. It is a fresh-selection event, so cursor reset is the right behaviour; no helper needed there.

## 5. Wire-through to Tracks / Player

- [x] 5.1 Where the carts-listState branch of the render passes props to the `Tracks` component (around `App.js:1098`-`1144`), pass the cart-cursor's `loadingMore`, `hasMore`, and `onLoadMore = this.loadMoreTracks.bind(this)` so `Tracks.js`'s existing `onLoadMore` trigger fires for the cart view too. The `Tracks.js:419` infinite-scroll trigger should not need code changes — confirm during wiring.
- [x] 5.2 If the `Player` (or any other renderer) reads `loadingMore` / `hasMore` for the carts view, update those bindings to read from `cartPagination` rather than the main-tracklist `pagination` slice.

## 6. Backend — track row gains `carts`

- [x] 6.1 Extend `queryUserTracks` in `packages/back/routes/users/db.js` so each track row carries `carts: { uuid: string }[]` aggregated from `track__cart` (left-joined, NULL filtered, scoped to the requesting user). Empty membership returns `[]`, not null.
- [x] 6.2 Same for `queryCartDetails` in `packages/back/routes/shared/db/cart.js` — every track row in the response's `tracks` array carries `carts` (the cart whose details are being fetched is one of them, plus any others the user has added the track to).
- [x] 6.3 Same for `searchForTracks` in `packages/back/routes/shared/db/search.js`.
- [x] 6.4 Confirm the canonical `JSON_TO_RECORD` track-details record-type used by `queryCartDetails` (`cart.js:199`) accepts the new `carts` field.

## 7. Backend — `/me/carts/default` becomes a uuid alias

- [x] 7.1 In `packages/back/routes/users/api.js`, change the `/carts/default` handler to resolve the user's default-cart uuid (via `queryDefaultCartId` or equivalent) and then delegate to the same code path that handles `/carts/<uuid>`. The response shape is unchanged.
- [x] 7.2 Remove the `cartId === 'default'` special-case in `packages/back/routes/shared/cart.js:138` (`getCartDetails`) — the SQL layer no longer needs to interpret `'default'`.

## 8. Frontend — drop `updateDefaultCart`, switch badge logic

- [x] 8.1 Remove `updateDefaultCart` from `App.js:411` and the corresponding entry in `updateStatesFromServer`. Verify no other caller depends on it (search and adjust if any).
- [x] 8.2 Replace `Tracks.js:580`'s `inDefaultCart={defaultCart ? defaultCart.tracks?.find(R.propEq(id, 'id')) !== undefined : false}` with a `carts`-based check (e.g. `(track.carts || []).some((c) => c.uuid === defaultCart.uuid)`).
- [x] 8.3 Replace `Tracks.js:542`'s `carts.filter((cart) => cart.tracks?.find(R.propEq(id, 'id')))` with a `carts`-based filter (`carts.filter((cart) => (track.carts || []).some((c) => c.uuid === cart.uuid))`).
- [x] 8.4 Replace `Player.js:197`, `:259`, `:265` (the same membership-scan pattern) with `carts`-based checks.
- [x] 8.5 Add a helper (`patchTrackCartMembership(slices, trackId, cartId, op)`) and use it in `addToCart` / `removeFromCart` to walk every state slice (`tracksData.tracks.{new,heard,recentlyAdded}`, `searchResults`, `selectedCart.tracks`, queue) and update each affected row's `carts` in place. The cart record itself still gets metadata-merged via the existing `mergeCartDetailsPreservingTracks`.

## 9. Tests + verification

- [x] 9.1 Update the `mergeCartDetailsPreservingTracks` unit tests to also assert that `carts` on the affected track row is updated correctly.
- [x] 9.2 Add unit tests for the new `patchTrackCartMembership` helper: track exists in multiple slices, track exists in only one slice, track exists in no slice, removing a cart id that wasn't there.
- [x] 9.3 Local: select a cart with <20 tracks, confirm `hasMore=false` after first paint. Select a cart with >20 tracks, confirm scrolling loads more pages until exhaustion.
- [x] 9.4 Local: scroll deep into a cart, click add-to-cart on a non-cart track in the main view, confirm the cart's row count increments and the user's scroll position does not jump. Same for remove on an in-memory row and on a not-loaded row.
- [x] 9.5 Local: switch between two carts back and forth, confirm cursor resets on each switch and no stale `loadingMore` indicator shows.
- [x] 9.6 Local: with a default cart of >20 tracks, confirm "in default cart" badges render correctly on every visible track row in `new` / `heard` / `recent` / search — including for tracks added long ago (the regression item 226 was filed for).
- [x] 9.7 Local: a track in a non-default, non-currently-viewed cart shows the correct multi-cart "in carts" badge (the pre-existing limitation that only the default + viewed cart counted).

## 10. Wrap-up

- [x] 10.1 Move backlog symlink: `mv backlog/todo/cm-033-carts-table-infinite-scroll backlog/in-progress/cm-033-carts-table-infinite-scroll` when starting the implementation. (Done at start of session.)
- [x] 10.2 Drop backlog item 226 (`cart-membership-check-without-full-tracks`) — its scope is subsumed by section 6/8 of this change. Move its symlink to `dropped/` with a note pointing at this change.
- [x] 10.3 _Verified on 2026-05-11; moving symlink to validated/. On user verification, move the 033 symlink onward (`to-be-verified/`, `validated/`, etc.); do not self-archive the OpenSpec change without explicit user verification.
