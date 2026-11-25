## 1. Database

- [x] 1.1 Add migration `packages/back/migrations/sqls/<timestamp>-add-cart-review-{up,down}.sql` (plus its `migrations/<timestamp>-add-cart-review.js` runner like its neighbours): `track__cart.track__cart_review_state text NULL` with the named check `track__cart_review_state_valid CHECK (track__cart_review_state IN ('accepted','rejected'))`, and `cart.cart_is_in_review boolean NOT NULL DEFAULT false`; down drops both
- [x] 1.2 Run the migration up and down against the test database and confirm existing `track__cart` rows read as to review (`NULL`)

## 2. Backend: reading carts with review data

- [x] 2.1 Write failing route tests in `packages/back/test/tests/users/cart-review.js` for `GET /api/carts/:uuid` with `review` and `store`: owner gets filtered pages, `page.total`, `reviewState` per row, `cart.review.counts` (store-filtered) and `cart.review.storeCounts` (whole cart); non-owner of a public cart gets no review fields and the `review` parameter ignored
- [x] 2.2 Extend `queryCartDetails` (`packages/back/routes/shared/db/cart.js`) with `{ includeReview, review }`: filter `matching_tracks` by state, add `reviewState` to `td`, add the `review` object to `cart`
- [x] 2.3 Pass `includeReview` only for the owner from `routes/logic.js getCartDetails` and `routes/shared/cart.js getCartDetails`; parse and validate the `review` query in `routes/public.js` and `routes/users/api.js` (400 on an unknown value)
- [x] 2.4 Make the tests from 2.1 pass

## 3. Backend: review routes

- [x] 3.1 Write failing tests for `PUT /api/me/carts/:id/review` (switch persists, non-owner refused) and `PUT /api/me/carts/:id/tracks/:trackId/review` (sets/clears state, returns counts for the `store` query, 404 for a track not in the cart, 400 for an unknown state, non-owner refused)
- [x] 3.2 Implement the two routes in `routes/users/api.js` with the queries in `routes/shared/db/cart.js` and ownership via `verifyCartOwnership`
- [x] 3.3 Write failing tests for `GET /api/me/carts/:id/accepted` (all pages, store filter, track URL falling back to release URL)
- [x] 3.4 Implement the accepted-links route
- [x] 3.5 Write failing tests for `POST /api/me/carts/:id/rejected` (remove; move to an existing cart where one track is already present; move to a new cart by name; store filter) and `POST /api/me/carts/:id/rejected/undo` (original `track__cart_added` and `rejected` state restored, only move-added tracks removed from the target, ownership re-checked for both carts)
- [x] 3.6 Implement both routes in one transaction each, removing and adding through `removeTracksFromCart` / `addTracksToCart` so Spotify-synced carts stay in sync
- [x] 3.7 Confirm `test/tests/users/cart-spotify-sync.js` and the existing cart tests still pass

## 4. Front-end: state and data flow

- [x] 4.1 In `App.js`, add `cartReview` state (`cartUuid`, `enabled`, `states`, `storeFocus`, `reviewFilter`, `counts`, `storeCounts`), fill it from each cart page, and send `review` / `store` on `selectCart` and `loadMoreTracks` when review is on
- [x] 4.2 Add API helpers for the five new routes; on a decision, update `states` and `counts` immediately, drop the row from the loaded list when it no longer matches the selected tab, and use the loaded row count as the next `offset`
- [x] 4.3 Make incoming pages apply local `cartReview.states` over their rows so a decision is not undone by a page that was in flight
- [x] 4.4 Extend `Player.isPlayable` to skip accepted, rejected and out-of-store-focus tracks when the queue source is `cart:<uuid>` of the cart under review; add unit tests in `playQueue` / `Player` tests for stepping past decided tracks and for review off

## 5. Front-end: bar, rows and pop-ups

- [x] 5.1 Add a controlled mode to `ToggleButton.js` (keeping the current uncontrolled use) and put the Review switch after the Filter box in the carts bar (`Tracks.js`), owner only
- [x] 5.2 Render the review-state tabs and store tabs as `select-button--container` rows with `role="tablist"` and `<small>` counts; hide `Tracks in cart` and `Find similar` while review is on; let the bar wrap at phone width
- [x] 5.3 Add the Review column and the Accept / Undecided / Reject group (`button-push_button`, `aria-pressed`) to `Track.js` rows; strike through and dim rejected rows in the All tab
- [x] 5.4 Add the empty-tab messages from the spec
- [x] 5.5 Add Open accepted with its store drop-down (existing `Popup`), disabled at zero; open one tab per track in the first included store, count blocked `window.open` calls and show the blocked-tabs notice
- [x] 5.6 Add Modify rejected with its drop-down (remove, move to an existing cart, move to a new cart), disabled at zero
- [x] 5.7 Add the Undo notice component (one line, `role="status"`, Undo button, auto-dismiss) and use it for bulk remove/move and swipe decisions

## 6. Front-end: player

- [x] 6.1 Add one App-level `decideCartTrack(trackId, state)` used by row buttons, panel buttons and swipe: it saves the state and, when the track is playing and the state is accepted or rejected, calls `playNextTrack`; unit-test that accepting/rejecting the playing track advances and that Undecided or deciding another track does not
- [x] 6.2 Add the review group to `Preview.renderTrackActions` (panel, docked bar, phone layout) when the playing track belongs to the cart under review and was started from it, wired to `decideCartTrack`; add no keyboard shortcuts

## 7. Front-end: phone swipe

- [x] 7.1 Make the swipe in `Track.js` direction-aware: in a cart under review, right past the threshold accepts, left rejects, with "Release to accept" / "Release to reject" in the reveal cell; stop short toward the current state; keep the heard swipe in other lists unchanged
- [x] 7.2 Show the Undo notice after each swipe decision; Undo restores the previous state
- [x] 7.3 Extend the existing swipe test (`packages/back/test/browser/swipe-mark-heard.js` pattern) with a cart-review swipe check in both directions and confirm the heard swipe test still passes

## 8. Demo recordings and browser tests

- [x] 8.1 Write `packages/back/test/lib/cart-review-seed.js` (API-only seeding: a cart with Beatport and Bandcamp tracks, idempotent, modelled on `cart-similarity-seed.js`) and `packages/back/test/lib/cart-review-steps.js` (turn review on, decide from rows and the player, switch store tab, remove rejected and undo, Open accepted with pop-ups allowed)
- [x] 8.2 Add `cart-review-local.js` and `cart-review-preview.js` sharing those steps, plus `cart-review-mobile-local.js` / `cart-review-mobile-preview.js` for the swipe flow
- [x] 8.3 Run the four demo tests locally and check the recordings show each step

## 9. Verification and hand-off

- [x] 9.1 Run `yarn cascade-test` for the touched backend tests and `yarn workspace fomoplayer_front test` during the work, then the full `yarn test` before the pull request
- [x] 9.2 Merge `master` into the branch, squash `wip:` commits into atomic ones, and open the pull request with the ```demo-test``` / ```demo-preview``` blocks and a list of where the implementation differs from the canvas (no review keyboard shortcuts, `<small>` counts instead of round pills, phone rows instead of cards)
