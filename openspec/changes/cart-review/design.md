## Context

The source design is the "Cart Triage" canvas (https://claude.ai/artifact/CeswbiJSzXsfkXiNMyDNQs): artboard 1 turns review on from the cart bar, artboard 2 is a full desktop review session, artboard 3 is review on a phone by swiping. This document maps it onto the existing code.

Current state (paths under `packages/front/src/` unless stated):

- **Cart view.** There is no separate carts component. `App.js` parses `/carts/:uuid` into `listState: 'carts'` and fetches one page of the cart with `GET /api/carts/:uuid?offset&limit` (`CART_TRACKS_PAGE_SIZE = 20`, more pages on scroll). That route is the public one (`packages/back/routes/public.js:20` → `routes/logic.js getCartDetails`), which serves the owner and, for public carts, anyone. `Tracks.js:731-774` renders the bar above the table: the `GlobalSearchBar` filter, `Tracks in cart: N` and `Find similar`. Filtering by the Filter box and by the "Enabled stores" toggles in the `Open ▾` header popup happens client-side over loaded pages and does not reach the player.
- **Data.** `track__cart(track__cart_id, cart_id, track_id, track__cart_added)` holds membership; `queryCartDetails` (`packages/back/routes/shared/db/cart.js:141`) returns `{ cart, tracks, page, meta }` ordered by `track__cart_added DESC`, with an optional `store` filter.
- **Player.** `Player.getQueueTracks()` snapshots the on-screen list (`playQueue.js queueTracks`), and next/previous/auto-advance step through it with `stepInQueue(queue, currentId, n, isPlayable)`. `isPlayable` (`Player.js:170`) is the hook that already skips tracks without a playable preview.
- **Panel actions.** `Preview.renderTrackActions` renders the cart button, Find similar, Follow, Ignore and Share in the panel, the docked bar and the phone layout.
- **Phone swipe.** `Track.js:18-126` implements a right swipe that marks a row heard (threshold 90 px, "Release to mark heard" reveal), enabled only for the New, Recent and Heard lists.
- **UI parts.** Switch: `ToggleButton.js` (uncontrolled checkbox). Tab rows: `select-button--container` / `select_button-button` (`SelectButton.css`), with the count shown as `<small>` in the `cart-search-chips` row (`CartSearchControls.js:240`). Buttons: `button-push_button`. The only toast is the one-line `cart-search-toast`; there is no undo component. Nothing calls `window.open`.

## Goals / Non-Goals

**Goals:**
- Persist a review state per cart membership and a review switch per cart, so review survives reloads and works across devices.
- Keep counts, tabs, the player queue and the bulk actions correct for carts larger than one loaded page.
- Reuse the existing switch, tab row, button, swipe and pagination code instead of the canvas's hand-drawn look-alikes.
- Leave the cart view exactly as it is when review is off, and never show review states to anyone but the cart owner.

**Non-Goals:**
- Pushing accepted tracks into a store's own cart (that is the browser-extension change `extension-fomo-cart-to-store-cart`).
- Review outside carts (the New / Recent / Heard lists) or review history.
- Changing the existing `Enabled stores` toggles or the Filter box.
- A card layout for phones: the canvas's phone cards are drawn from the existing phone rows' content; the implementation keeps the existing phone row layout.

## Decisions

### 1. Review state lives on `track__cart`, the switch on `cart`

One migration adds:

- `track__cart.track__cart_review_state text NULL` with a named check `track__cart_review_state_valid CHECK (track__cart_review_state IN ('accepted', 'rejected'))`. `NULL` means "to review". Every existing row is therefore "to review" without a backfill.
- `cart.cart_is_in_review boolean NOT NULL DEFAULT false`.

Both follow the table-name-prefix rule, so `NATURAL JOIN` chains through `track__cart` and `cart` are unaffected.

*Why on the membership row:* a decision is about a track *for this cart* ("buy for this set"); the same track in another cart is a separate question. It also makes the state disappear when the track leaves the cart, and a re-added or moved track starts as "to review" because it is a new row.
*Alternatives:* a separate `track__cart_review` table (an extra join everywhere for a single nullable value; rejected); a Postgres enum (harder to change than `text` + a named check; rejected per the project's column-type rule); storing the switch in `localStorage` (would not follow the user from desktop to phone, which artboard 3 assumes; rejected).

### 2. Counts and filtering are server-side

`queryCartDetails` gains an options argument `{ includeReview, review, stores }`:

- `review` = `to-review` | `accepted` | `rejected` | absent (all) filters `matching_tracks`, so `page.total` and paging follow the tab.
- When `includeReview` is true each track row carries `reviewState` (`null` | `'accepted'` | `'rejected'`) and `cart` carries `review: { enabled, counts: { toReview, accepted, rejected, all }, storeCounts: [{ store, count }] }`. `counts` respect the store filter (the store tab narrows the counts, as on the canvas); `storeCounts` cover the whole cart, so the store tabs always show every store's size.
- `logic.getCartDetails` sets `includeReview` only when the caller owns the cart. For anyone else the `review` parameter is ignored and no review fields are returned.

*Why:* the cart is paged 20 rows at a time; counting or filtering client-side would be wrong for any cart larger than a page. *Alternative:* load the whole cart when review is on (`all: true`, up to 500 per request) — simpler front-end, but slow on big carts and still capped; rejected.

The store tab reuses the existing `store` query parameter (already filtered with `LOWER(store_name) = ANY(...)`). The tab offers only stores with at least one track in the cart.

### 3. New owner-only routes in `packages/back/routes/users/api.js`

| Route | Body / query | Effect |
|---|---|---|
| `PUT /me/carts/:id/review` | `{ enabled }` | Sets `cart_is_in_review`. 204. |
| `PUT /me/carts/:id/tracks/:trackId/review` | `{ state: 'accepted' \| 'rejected' \| null }` | Sets one row's state; returns the cart's fresh `review.counts` (for the current `store` query) so the tab badges update without refetching the list. 404 if the track is not in the cart. |
| `GET /me/carts/:id/accepted` | `?store=` | Every accepted track in the cart (all pages) with its store links: `[{ trackId, links: [{ store, url }] }]`. `url` is the track's store URL, else its release URL, as `Track.js` builds today. |
| `POST /me/carts/:id/rejected` | `{ action: 'remove' }` or `{ action: 'move', targetCartId }` or `{ action: 'move', newCartName }`; `?store=` | In one transaction removes every rejected track (within the store filter) from this cart and, for `move`, adds the ones not already there to the target (creating it for `newCartName`). Returns `{ count, targetCart, undo }`. |
| `POST /me/carts/:id/rejected/undo` | the `undo` object | Puts the tracks back with their original `track__cart_added` and state `rejected`, and removes from the target cart only the tracks the move added. |

All verify ownership through the existing `verifyCartOwnership`. Removal and addition go through `removeTracksFromCart` / `addTracksToCart` so carts synced to Spotify stay in sync. `addTracksToCart` already accepts `addedAt`, which is what lets Undo restore the original order.

*Why a server-held bulk action:* "Modify rejected" must cover rejected tracks on pages that are not loaded. *Why the client holds the undo payload:* no server-side undo log is needed, and the payload only names tracks the caller owned a moment ago (the undo route re-checks ownership of both carts). An undo after a move into a newly created cart leaves that cart in place, empty.
*Alternative:* extend `PATCH /me/carts/:id/tracks` with a `review` operation. That route answers with the whole first page of the cart on every call, which is wasteful for a click that only changes one badge; rejected for per-track decisions.

### 4. The player skips decided tracks through `isPlayable`

App state keeps `cartReview = { cartUuid, enabled, states: { [trackId]: state }, storeFocus }` for the selected cart, filled from each loaded page and updated on every decision. `Player.isPlayable` additionally returns false for a track when **the queue's source is that cart** (`playingFrom.source.key === 'cart:<uuid>'`), review is on, and the track is accepted, rejected or outside the store focus. Stepping (`stepInQueue`) already walks past unplayable tracks, so next, previous, auto-advance, media keys and the "3 failures" fallback all skip decided tracks with no other change.

Clicking a decided row still plays it (an explicit choice); the predicate only governs stepping. If the queue snapshot was taken from a single page, stepping past its end loads nothing new — unchanged behaviour.

*Alternative:* rebuild the queue snapshot after every decision. The snapshot is shared with other sources and would lose the user's position; rejected.

### 5. Accepting or rejecting the playing track advances

`Preview.renderTrackActions` gains a review group (Accept / Undecided / Reject, `button-push_button` buttons with `aria-pressed`, joined like the existing cart button pair) rendered before the cart button when the playing track belongs to the reviewed cart. In the docked bar and the narrow layouts the labels collapse to the icons, as the canvas's container rules do.

Advancing is tied to the track, not to the control: one App-level `decideCartTrack(trackId, state)` stores the decision and, when `trackId` is the playing track and the new state is accepted or rejected, calls `playNextTrack`, which (through decision 4) lands on the next track still to review. The player panel buttons, the row buttons and the phone swipe all go through it, so accepting the playing track from its row advances exactly like the panel button does. Deciding any other track never touches playback. Undecided never advances; it only clears a decision.

### 6. No keyboard shortcuts for review

The canvas's button titles hint at A / U / R. They are not implemented, and no other review keys are added: `a` keeps seeking backwards and `r` keeps playing the next unheard track. `KeyboardShortcutsPopup.js` is unchanged.

### 7. Bar, rows and tabs reuse existing components

- The **Review** switch is `ToggleButton` made controllable (a `checked` + `onChange` variant; the current uncontrolled `defaultChecked` use stays as is) placed after the Filter box.
- The **review tabs** and **store tabs** are `select-button--container` rows with `role="tablist"`. Counts use the existing `<small>` count pattern of the cart-search chips, **not** the canvas's round `.cnt` pill, which does not exist in the app (this is a deviation from the canvas to tell the owner about).
- **Open accepted** (with the ▾ store chooser) and **Modify rejected ▾** are `button-push_button` buttons, disabled with the real `disabled` attribute when their count is zero. Their pop-ups reuse the existing `Popup` used by `Open ▾` and `CartDropDownButton` (cart list plus "New cart" input).
- Each row gets a **Review** column with the three-button group; rejected rows get a struck-through title and dimmed text in the All tab.
- The bar wraps on narrow screens; at phone width the two bulk buttons shorten to "Open" and "✕" with their counts, as artboard 3 draws them.
- The **Undo notice** is a new small component (one line, `role="status"`, an Undo button, auto-dismiss after ~8 s) styled like the playing-row blue `#5181bd` band in the canvas. It replaces nothing; the cart-search toast stays as is.

### 8. Opening accepted tracks in new tabs

`Open accepted` fetches `GET /me/carts/:id/accepted`, picks for each track the first chosen store it has (one tab per track, never two), and calls `window.open(url, '_blank', 'noopener')` for each inside the click handler. Browsers allow only one pop-up per click unless the user allows pop-ups for the site, so the code counts `null` returns; if any were blocked it shows a notice: "Your browser blocked N tabs. Allow pop-ups for this site, then press Open accepted again." Tracks on none of the chosen stores are skipped and counted in the same notice.

*Alternative:* open tabs in batches, one batch per click. Possible later; the extension change already covers batched opening for Bandcamp.

### 9. Phone: two-way swipe on the existing rows

`Track.js`'s swipe becomes direction-aware: in a cart under review, right past the threshold accepts and left rejects, with the existing reveal cell showing "Release to accept" / "Release to reject". The heard-marking swipe in other lists is unchanged. A swipe toward the state the track already has stops short (as the canvas does) and decides nothing. Each swipe shows the Undo notice; Undo restores the previous state. The row's review buttons stay available as the non-gesture way to decide.

### 10. Pagination while tracks leave the current tab

Deciding a track on the To review tab (or moving it out of the Accepted/Rejected tab) removes it from the loaded list. The next page's `offset` is the number of rows still loaded, not the number ever loaded, so no track is skipped by the shrinking server-side set. Counts come from the decision route's response, so they never drift.

## Risks / Trade-offs

- [Pop-up blocking stops "Open accepted" after the first tab] → detect blocked opens and tell the user how to allow pop-ups (decision 8); the per-row store links keep working.
- [A decision races a page load and the row reappears] → the page merge applies `cartReview.states` over incoming rows, so the newest local decision wins until the server answers.
- [Bulk move/remove of hundreds of tracks to a Spotify-synced cart is slow] → the existing remove/add path already batches per cart; the route runs in one transaction and the notice appears only on success.
- [Undo after the user changed the target cart meanwhile] → undo removes only tracks the move added and re-adds only tracks no longer in the source cart; anything else is left alone.
- [The canvas's look and the app's components differ (count pill, card layout on phone)] → follow the app's components and list the differences in the pull request.

## Migration Plan

1. Migration `<timestamp>-add-cart-review-up.sql` adds the two columns (nullable / defaulted, so no table rewrite on Postgres 11+) and the named check; the down migration drops them.
2. Deploy backend and front-end together (one image). Old clients ignore the new fields; review is off for every cart until the owner turns it on.
3. Rollback: revert the image; the down migration is optional because the new columns are ignored by old code.

## Open Questions

- Whether the "Enabled stores" toggles in the `Open ▾` header should later merge with the new store tabs; out of scope here, both act independently (the list shows tracks passing both).
