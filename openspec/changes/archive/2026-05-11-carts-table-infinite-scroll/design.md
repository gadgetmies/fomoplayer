## Context

Today's carts view loads through a single call site, `selectCart` in `packages/front/src/App.js:832`, which fetches `/carts/${uuid}${filter}` with no `offset` / `limit` and stores the entire response as the selected cart's `tracks` array. The frontend has no awareness that the response is paged at all.

What's actually happening is more subtle than it looks:

- `getCartDetails` → `queryCartDetails` (`packages/back/routes/shared/db/cart.js:135`) defaults to `{ offset: 0, limit: 200 }`. Carts larger than 200 tracks are silently truncated; the frontend has no way to know there are more.
- The same query already returns a top-level `track_count` (full COUNT, not the slice length) — the exact `total` the frontend needs for `hasMore` arithmetic.
- The main tracklist's pagination shape (`pagination[category] = { offset, count, total }` used by `hasMoreTracks` / `loadMoreTracks` at `App.js:151` / `:165`) is what we want to mirror, but its shape is keyed by `category` (`new`/`heard`/`recent`) inside a single `pagination` object on state. The carts view needs a parallel slice that's keyed differently — by cart, or as a single "selected cart" cursor — and it must not collide with the tracks-panel slice.
- `addToCart` / `removeFromCart` (`App.js:368` / `:378`) call `PATCH /carts/:id/tracks` and replace the entire cart via `updateCart`. Once paging is in place, this overwrite would silently undo the user's scroll position and re-truncate the tracks at 200.

## Goals / Non-Goals

**Goals:**

- The cart view fetches one page on first paint and grows on scroll, the same way the main tracklist does today.
- A user with a 5,000-track cart can scroll all the way to the bottom; a user with a 50-track cart sees one fetch and `hasMore=false`.
- Switching between carts is clean — no leftover offset, no spurious "loading more" indicator.
- Adding or removing a track from the visible cart preserves the user's scroll position.
- Backend behaviour is unchanged — the existing `track_count` and `offset`/`limit` contract is the load-bearing surface.

**Non-Goals:**

- Generalising the pagination plumbing into a shared hook. A single, faithful copy of the main-tracklist pattern is enough to land the feature; refactoring the two together is a separate item.
- Changing the cart sort order, filter UI, or store-scoping of `GET /carts/:id`.
- Server-side rate limiting or per-user cart-fetch budgeting.
- The 200-truncation bug for users on master today is fixed *as a consequence* of this change, not as its primary goal.

## Decisions

### Decision: Mirror the main-tracklist pagination shape, not invent a new one

**Rationale:** `App.js` already encodes `{ offset, count, total }` per panel and uses it for `hasMore` arithmetic. The carts view will read identically — `cartPagination = { offset, count, total }` for the currently-selected cart — so the call sites in `hasMoreTracks` / `loadMoreTracks` add a parallel branch instead of a new mental model. `count` is the running length of the loaded `tracks` array, `total` comes from the response's `track_count`, `hasMore` is `offset + count < total`.

**Alternatives considered:**

- *Per-cart pagination keyed by cart UUID.* Useful for the (rare) case where the user pre-loads a different cart than the one currently selected. Rejected for this iteration — the single "selected cart" cursor matches the only call path we have today (`selectCart`); per-cart maps add bookkeeping for an unobserved use case.
- *Read-side derivation only ("page came back shorter than `limit` ⇒ no more").* Rejected because the response already carries `track_count`. Using it is both more explicit (we can show totals if the UI ever wants them) and dodges the boundary edge case where `limit` divides `total` exactly and the last page comes back full.

### Decision: Match the panel-tracklist page size of 20

**Rationale:** The main tracklist's `limit_<category>=20` defines the project's existing answer to "how many rows fetch at a time as the user scrolls a list?". Carts are visually the same `Tracks.js` component rendering the same kind of rows; treating them as a different size would invent a discrepancy users have to learn. A standalone `CART_TRACKS_PAGE_SIZE` constant is still introduced so the cart's page size is overridable independently if that ever proves necessary, but its value mirrors the panel constant.

The backend's existing default of `limit: 200` is left alone — non-paged callers continue to work as before; the carts view simply opts in to a smaller, scroll-driven page size.

**Alternatives considered:**

- *Reuse the search-results limit of 100.* Acceptable but conflates two unrelated concepts (the search constant lives inside `searchFilters` and is user-tunable via URL).
- *A larger value like 100, anticipating that flat-list consumption differs from panel consumption.* Rejected on user feedback — paging in 20 keeps the UX uniform across views and avoids the "why is this list special?" question.
- *Match the backend default of 200.* Rejected — first-paint cost stays as bad as today's worst case, just with infinite scroll bolted on.

### Decision: `selectCart` resets the cart pagination slice; `loadMoreTracks` extends it

**Rationale:** The selected-cart cursor is conceptually a single piece of state that follows the user's selection. When `selectCart` runs, the cursor resets to `{ offset: 0, count: pageSize, total }` and `tracks` is replaced (not appended). When `loadMoreTracks` runs in the cart `listState`, it requests `?offset=count&limit=pageSize`, appends the response into `tracks`, and updates the cursor. That keeps the two operations cleanly separated — there's never a moment where "am I on a fresh selection or a paginated continuation?" is ambiguous.

The `loadingMore` flag is set on `selectCart`'s subsequent calls only — first-paint uses the existing `fetchingCartDetails` flag so the view's "spinner-vs-loading-more-row" UX can stay distinct.

### Decision: Cart membership lives on the track row as `carts: [{ uuid }]`

**Rationale:** The pre-existing pattern of "scan every cart's `tracks` array to discover which carts contain a given track id" is broken-by-construction once any cart's `tracks` array is paged. Three properties make the per-track shape strictly better:

1. **It works regardless of pagination.** Every track row can answer "which carts am I in?" in `O(1)` from its own data; we never fetch a cart's `tracks` array just to power a badge.
2. **It eliminates `updateDefaultCart` entirely.** The default cart's tracks were fetched on every app load only to power the "in default cart" badge. Once `carts` is on each track row, the badge is `track.carts.some(c => c.uuid === defaultCart.uuid)` — no separate fetch.
3. **It exposes carts the frontend never visited.** Today the `Tracks.js:542` "in carts" filter only sees the default cart and the currently-viewed cart, because no other cart in `state.carts` has a `tracks` array. With `carts` per track, a track's full membership is always visible.

The shape is `carts: [{ uuid: string }]` — an array of objects keyed on `uuid`, not numeric ids — because:

- **uuid is the user-facing identifier.** It appears in URLs (`/carts/<uuid>`), in share links, and in API responses. Internal numeric ids leak only when a code path forgets to translate; standardising on uuid at the JSON boundary removes the leak by construction.
- **The shape is forward-compatible.** Future enrichments (e.g. surfacing `name` or `is_default` directly on the track row to spare the `state.carts` join) just add fields to the same objects, without breaking existing consumers.
- **It avoids the redundant singular `cart_id`** the queryCartDetails td CTE used to emit alongside the per-track JSON; that field was never read by any frontend consumer and has been dropped.

The full cart records (with id, name, is_default, store_details) still live in `state.carts` (from `updateCarts`); the frontend joins by uuid when it needs richer fields than `carts: [{ uuid }]` provides.

**SQL surface:** every query that builds the canonical track row (`queryUserTracks`, `queryCartDetails`, `searchForTracks`) gains a CTE that left-joins `track__cart` against `cart` (to surface `cart_uuid`), aggregates `JSON_AGG(JSON_BUILD_OBJECT('uuid', cart_uuid)) FILTER (WHERE cart_uuid IS NOT NULL)` per `track_id`, and surfaces it as `carts` in the row's JSON. Empty membership (`[]`) is the canonical "in no cart" value, not `null`.

**Alternatives considered:**

- *`cart_ids: number[]` (numeric ids only).* Rejected — leaks internal ids into client code, and the inability to use uuids in cross-system references (URLs, share links) means the frontend would have to maintain a per-render id-to-uuid lookup against `state.carts`. uuid in the payload removes that lookup.
- *Per-track-page batched membership lookup* (a separate `POST /me/cart-memberships` endpoint that returns `{ trackId: <carts> }` for visible track ids). Rejected — extra round trip, extra moving part, no upside over inlining `carts` in the track row that already exists.
- *Per-cart id list endpoint* (`GET /me/carts/<uuid>/track-ids`). Rejected — same round-trip cost plus N endpoints (one per cart) for what is naturally a track-side property.
- *Full cart records inline on each track row* (`carts: [{ id, name, is_default, ... }]`). Rejected — duplicates `state.carts` and bloats every track payload. The hybrid `[{ uuid }]` keeps the door open for adding fields without committing to all of them.

### Decision: `/me/carts/default` resolves the uuid and delegates to the standard handler

**Rationale:** Today the route is a special case — same shape but a different code path internally (`getCartDetails(uuid='default')` triggers a `cartId === 'default'` branch in `cart.js:138` that resolves to `queryDefaultCartId(userId)` before falling through). After this change, the route handler resolves the user's default-cart uuid up front and then runs the exact same code as the `<uuid>` route. Implications:

- The two routes share `offset`/`limit`/`store` semantics by definition — no place to drift.
- Clients can use either form; both yield identical responses (same shape, same paging, same `track_count`, same `cart_ids` per track).
- The `'default'` literal stops being a magic string at the SQL layer — it lives only as a route-level alias.

**Alternatives considered:**

- *Have the frontend always pre-resolve the default uuid.* Rejected — it's a server-side concern (the default cart is part of the user's record). Forcing every client to resolve it themselves adds friction.
- *Redirect (301/307) `/me/carts/default` → `/me/carts/<uuid>`.* Rejected — extra round trip for no benefit; in-process delegation is cheaper.

### Decision: `addToCart` / `removeFromCart` reconcile by patching `carts` everywhere the track appears

**Rationale:** With membership living on the track row, an add/remove must update the *track row's* `carts` in every state slice that holds a copy of that track:

- `state.tracksData.tracks.{new, heard, recentlyAdded}` (the panel views).
- `state.searchResults` (search hits).
- The `tracks` array of any cart in `state.carts` that has been loaded (currently-viewed cart, plus any others touched).
- Any in-flight queue / now-playing state if the affected track is there.

The reconciler walks each slice, finds rows where `track.id === affectedTrackId`, and on `add` appends `{ uuid: <affected cart uuid> }` to `track.carts` (idempotent — no append if uuid already present), or on `remove` filters out the matching `{ uuid }` entry. The cart uuid is sourced from `state.carts[cartId]` (looked up by numeric id, since the `addToCart(cartId, trackId)` API still takes a numeric id — the PATCH endpoint expects it). Cart metadata (`track_count`, `store_details`, etc.) is merged from the PATCH response onto the affected cart record. The cart's own `tracks` array — if loaded — is updated in place: prepend the new track row on `add` (cart sort order is `track__cart_added DESC`, so the addition lands at the top), splice out the matching id on `remove`.

**Why not just refetch?** A single PATCH that changes one bit of state forcing a full re-fetch of every paged cart and every visible tracklist would be punishingly expensive on every cart edit. The patch-everywhere strategy is `O(visible-track-count)` and runs entirely in memory.

**Edge cases:**

- The track is not in any state slice in memory (e.g. it was added from a notification we haven't rendered): nothing to patch; the next render of any list that includes the track will pick up the correct `cart_ids` from the server. Acceptable — no inconsistency.
- The same track appears in multiple slices (e.g. in `new` and in `searchResults`): both copies get patched — they share the cart id space, no conflict.

**Alternatives considered:**

- *Mutate a single shared `tracksById` map and have all views index into it.* Cleanest model but a large refactor; today's state is per-list-slice. Out of scope.
- *Refetch only the affected cart's metadata* (no full track refetch, no in-place patching). Loses the `cart_ids` update on the affected track row, so the badge would lie until the next paged tracklist load. Rejected.

### Decision: Switching carts resets paging; pre-existing carts in `state.carts` keep their last-loaded snapshot

**Rationale:** `state.carts` is keyed by id and stores the most-recently-fetched cart record. When the user re-selects a previously-visited cart, today's code uses the existing record as the initial render and refetches in the background. With paging, the existing record's `tracks` is the first page (or whatever the user scrolled to) — that snapshot is still useful as the initial paint. `selectCart` resets the *cursor* to `{ offset: 0, count: pageSize }` and refetches the first page; subsequent `loadMoreTracks` calls extend from there. The previous snapshot is overwritten only when the new first page arrives — preventing a flash of empty rows on cart switch.

## Risks / Trade-offs

- **Add/remove reconciliation is a heuristic, not a contract.** The splice strategy works because cart tracks are ordered `track__cart_added DESC` and a fresh add lands at the top. If the ordering ever changes (e.g. user-defined sort), the strategy breaks silently — the new track lands in the wrong position and the count is fine. **Mitigation:** the spec's add/remove scenarios encode the current ordering assumption explicitly so a sort change must update the spec; a unit test for the reconcile helper guards the invariant.
- **Page-size constant is a fresh tunable.** Adds one more "knob" to the codebase. **Mitigation:** name it `CART_TRACKS_PAGE_SIZE`, document it next to its use, and reuse the value across both first-page and load-more so there's no place that drifts.
- **The 200-truncation bug fix is invisible to the user without a UI signal.** Today, anyone with a >200-track cart has been silently missing rows; after this change those rows reappear, but nothing in the UI calls attention to it. **Mitigation:** acceptable — the new behaviour is strictly better, and "you can now scroll past row 200" doesn't need an announcement.
- **Per-cart paging state is per-session, not per-cart.** If the user scrolls deep into cart A, switches to cart B, and switches back, they restart from page 1. **Mitigation:** matches the current main-tracklist behaviour (also session/cursor based, not per-panel). Cross-session memory is a future enhancement, separate item.

## Migration Plan

No data migration; no backend changes. Ship as one frontend change. Rollback is a revert of the front-end commit.

Behaviour for users on master today: they will see strictly *more* coverage on carts >200 tracks than they did before, plus a loading-more indicator at the bottom of any cart whose total exceeds the page size. No user-visible breakage path.

## Open Questions

- Should the page-size constant live in `App.js` next to the existing pagination state, or in a `constants.js`-style module? Default proposal: alongside the rest of the cart code in `App.js` for now; promote to a shared module if/when the generalisation refactor lands.
- The brief notes that `Tracks.js:419` `onLoadMore` is already generic. Confirm during implementation that the cart-listState binding wires through cleanly — if it doesn't, the binding (not the component) gets the fix.
- After this lands, should we revisit the *backend* default `limit: 200`? Leaving it gives any non-paged caller a working response; lowering it forces every caller to opt in. Out of scope for this change but worth noting as a follow-up consideration.
