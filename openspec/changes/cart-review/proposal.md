## Why

A cart in Fomo Player fills up with candidate tracks long before the user buys anything. Going through it today means listening to every track again each time, because the player cannot tell which tracks have already been judged: tracks the user already wants to buy keep coming back in the queue, and tracks they have ruled out stay in the cart until removed one by one. When one store has a sale, there is also no way to work through only that store's tracks.

Cart review lets the user mark each cart track as **accepted** (will buy), **rejected** (will not), or leave it **undecided**, so the player plays only the tracks still to review, the accepted tracks can be opened in their stores in one go, and the rejected ones can be removed or moved to another cart in one go. The design is the "Cart Triage" canvas (three artboards: turning review on, reviewing a cart on a desktop, reviewing on a phone by swiping): https://claude.ai/artifact/CeswbiJSzXsfkXiNMyDNQs

## What Changes

- Each track in a cart gets a **review state**: to review (the default for every track, including all existing ones), accepted, or rejected. The state belongs to the track's membership in that one cart; the same track in another cart has its own state.
- Each cart gets a **Review** switch in the bar above the cart's track table. It is stored with the cart, so a cart left in review on the desktop is still in review on the phone.
- While review is on:
  - The bar shows review-state tabs (**To review / Accepted / Rejected / All**, each with a count) and store tabs (**All / Beatport / Bandcamp …**, each with a count, only the stores that have tracks in the cart). The store tab narrows everything on the page — the list, the counts, the player queue and the bulk actions — to that store.
  - Every track row gets an **Accept / Undecided / Reject** button group; rejected tracks are shown struck through and dimmed in the **All** tab.
  - The player panel gets the same button group for the playing track.
  - Accepting or rejecting the **playing** track — from the player panel, its row, or a phone swipe — moves straight to the next track still to review.
  - No keyboard shortcuts are added for review (the canvas's A / U / R hints are not implemented).
  - Next, previous and auto-advance in the player skip tracks that are already accepted or rejected.
  - **Find similar** in the bar is replaced by **Open accepted** (opens each accepted track in its store in a new browser tab, with a drop-down to choose which stores) and **Modify rejected** (remove all rejected tracks from this cart, or move them to another cart or a new cart). Bulk removal and moving show a notice with **Undo**.
  - When the To review tab is empty the table says so and points at the two bulk actions.
- On a phone, the cart's track rows (the existing phone layout of the table) can be swiped while review is on: right accepts, left rejects, with a "Release to accept / reject" indicator past the threshold and an Undo notice after each swipe. This reuses the existing right-swipe that marks tracks heard in the New, Recent and Heard lists, which is not offered in carts today.
- Backend: the cart tracks endpoint accepts a review-state filter and returns per-state and per-store counts; new endpoints set a track's review state, switch review on or off, list the accepted tracks' store links, and move or remove the rejected tracks (with an undo).
- When review is off, the cart view looks and behaves exactly as today (the stored states are kept, just not shown).

## Capabilities

### New Capabilities
- `cart-review`: review states for cart tracks, the per-cart Review switch, the review-state and store tabs with counts, deciding from the track rows, the player panel and phone swipes, advancing when the playing track is accepted or rejected, the player skipping decided tracks, opening accepted tracks in their stores, and removing or moving rejected tracks with undo.

### Modified Capabilities
- `cart-tracks-pagination`: the paged cart tracks request gains review-state and store filters, and the response gains review-state and store counts, so the tabs and counts stay correct for carts larger than one page.

## Impact

- **Database**: one migration adding a review-state column to `track__cart` and a review-switch column to `cart` (both following the table-name-prefix rule). Existing rows default to "to review" and "review off".
- **Backend** (`packages/back/routes/users/api.js`, `routes/shared/cart.js`, `routes/shared/db/cart.js`): new query parameters and response fields on `GET /me/carts/:id`; new routes for setting review state, the review switch, accepted-track store links, and bulk handling of rejected tracks. The public shared-cart route (`/carts/:uuid`) never exposes review states.
- **Front-end** (`packages/front/src`): the carts view bar, the track table rows, the player panel, the player's next/previous selection, a new undo notice, and two-way swipe on the phone rows.
- **Tests**: backend route tests for the new endpoints and filters, front-end unit tests for the queue skipping, and paired `demo-test` / `demo-preview` browser tests under `packages/back/test/browser/` (required for UI changes).
- No new dependencies. Cart syncing to Spotify keeps working because removing rejected tracks goes through the existing remove-from-cart path.
