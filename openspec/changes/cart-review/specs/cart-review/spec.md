## ADDED Requirements

### Requirement: Cart tracks have a review state

Every track in a cart SHALL have a review state for that cart: **to review**, **accepted** or **rejected**. A track added to a cart (including tracks already in carts when this feature ships, tracks re-added after removal, and tracks moved in from another cart) SHALL start as to review. The state SHALL belong to the track's membership in that one cart: the same track in another cart SHALL keep its own state there, and removing the track from the cart SHALL discard its state.

#### Scenario: Existing tracks start as to review

- **WHEN** the feature is deployed and the owner turns review on for a cart that already holds 14 tracks
- **THEN** all 14 tracks are to review

#### Scenario: Same track in two carts

- **WHEN** a track is in carts A and B and the owner accepts it in cart A
- **THEN** the track is accepted in cart A and still to review in cart B

#### Scenario: Re-added track starts over

- **WHEN** a rejected track is removed from a cart and later added to it again
- **THEN** it is to review

### Requirement: Review is switched on per cart and remembered

The bar above a cart's track table SHALL offer a **Review** switch to the cart's owner. Its state SHALL be stored with the cart, so it is the same after a reload and on another device. Turning review off SHALL hide all review controls and restore the cart view's current behaviour (`Tracks in cart: N`, `Find similar`, the player stepping through every track) while keeping the stored review states.

#### Scenario: Turning review on

- **WHEN** the owner opens a cart with review off and turns the Review switch on
- **THEN** the review-state tabs, store tabs, the Review column, Open accepted and Modify rejected appear
- **AND** `Find similar` and `Tracks in cart: N` are hidden

#### Scenario: Review persists across devices

- **WHEN** the owner turns review on for a cart on a desktop and later opens the same cart on a phone
- **THEN** the cart is in review on the phone

#### Scenario: Turning review off keeps decisions

- **WHEN** the owner accepts three tracks, turns review off, and turns it on again
- **THEN** the three tracks are still accepted

### Requirement: Review states are private to the owner

Review states and the review switch SHALL be visible and changeable only by the cart's owner. A request for a public cart by anyone else SHALL return no review fields and SHALL ignore any review-state filter. Every review route SHALL refuse a caller who does not own the cart.

#### Scenario: Public cart viewed by another user

- **WHEN** another user opens a public cart whose owner has accepted and rejected tracks
- **THEN** the response carries no review state on any track and no review counts
- **AND** the page shows no review controls

#### Scenario: Another user tries to set a state

- **WHEN** a user who does not own a cart sends a request to set a track's review state in it
- **THEN** the request is refused and the state is unchanged

### Requirement: Review-state and store tabs with counts

While review is on, the bar SHALL show review-state tabs **To review**, **Accepted**, **Rejected** and **All**, each with the number of tracks in that state, and store tabs **All** plus one tab per store that has at least one track in the cart, each with that store's number of tracks. To review SHALL be selected when review is turned on. The selected store tab SHALL narrow the track list, the review-state counts, the player's stepping, Open accepted and Modify rejected to that store's tracks. Counts SHALL cover the whole cart, not only the loaded pages, and SHALL update immediately after every decision.

#### Scenario: Counts for a large cart

- **WHEN** a cart has 300 tracks of which 40 are accepted and only the first 20 are loaded
- **THEN** the Accepted tab shows 40

#### Scenario: Store focus narrows everything

- **WHEN** a cart has 7 Beatport and 7 Bandcamp tracks and the owner selects the Beatport store tab
- **THEN** the list shows only Beatport tracks
- **AND** the review-state counts count only Beatport tracks
- **AND** Open accepted and Modify rejected act only on Beatport tracks
- **AND** the player steps only through Beatport tracks

#### Scenario: Deciding updates the counts

- **WHEN** the owner accepts a track on the To review tab
- **THEN** the To review count drops by one, the Accepted count rises by one, and the track leaves the To review list

### Requirement: Deciding from a track row

While review is on, every track row SHALL show an **Accept / Undecided / Reject** button group showing the track's current state as pressed. Pressing a button SHALL set that state. In the All tab a rejected track's title SHALL be struck through and its row dimmed (except the playing row, which keeps its playing colour).

#### Scenario: Accept from a row

- **WHEN** the owner presses Accept on a to-review track's row
- **THEN** the track is accepted, the row's Accept button shows as pressed, and the change is saved

#### Scenario: Back to undecided

- **WHEN** the owner presses Undecided on an accepted track's row
- **THEN** the track is to review again

### Requirement: Accepting or rejecting the playing track advances to the next track to review

When the playing track belongs to a cart under review and the player was started from that cart, the player panel SHALL show the same Accept / Undecided / Reject group next to the cart buttons. Whenever the playing track is accepted or rejected — from the player panel, from its row in the track table, or by a phone swipe — the state SHALL be saved and the player SHALL immediately play the next track still to review. Marking the playing track Undecided SHALL NOT change playback. Deciding a track that is not playing SHALL NOT change playback. No keyboard shortcuts SHALL be added for review; the existing keys keep their meaning.

#### Scenario: Reject from the panel

- **WHEN** a to-review track is playing from the cart under review and the owner presses Reject in the player panel
- **THEN** the track becomes rejected
- **AND** the next track still to review starts playing

#### Scenario: Accept the playing track from its row

- **WHEN** a to-review track is playing from the cart under review and the owner presses Accept on that track's row
- **THEN** the track becomes accepted and the next track still to review starts playing

#### Scenario: Swipe the playing track

- **WHEN** the owner swipes the playing track's row left past the threshold on a phone
- **THEN** the track becomes rejected and the next track still to review starts playing

#### Scenario: Undecided keeps playing

- **WHEN** an accepted track is playing and the owner presses Undecided in the player panel
- **THEN** the track is to review again and keeps playing

#### Scenario: Deciding another track

- **WHEN** track T1 is playing and the owner accepts track T4 from its row
- **THEN** T1 keeps playing

#### Scenario: No review keys

- **WHEN** the owner presses A, U or R while reviewing
- **THEN** no review state changes; A still seeks backwards and R still plays the next unheard track

#### Scenario: Not offered outside the reviewed cart

- **WHEN** the playing track was started from the New tracks list
- **THEN** the player panel shows no review buttons

### Requirement: The player skips decided tracks while reviewing

When the player was started from a cart under review, next, previous, auto-advance at the end of a preview, media keys and the playback-failure fallback SHALL skip tracks that are accepted, rejected or outside the selected store tab. Clicking a decided track's row SHALL still play it. When review is off the player SHALL step through every track as before.

#### Scenario: Auto-advance skips accepted tracks

- **WHEN** the cart under review lists tracks T1 (to review), T2 (accepted), T3 (to review) and T1 finishes playing
- **THEN** T3 starts playing

#### Scenario: Explicit play of a decided track

- **WHEN** the owner clicks an accepted track's row
- **THEN** that track plays

#### Scenario: Review off

- **WHEN** review is off and T1 finishes playing
- **THEN** T2 starts playing even though it is accepted

### Requirement: Open accepted tracks in their stores

While review is on, the bar SHALL offer **Open accepted** with the number of accepted tracks it would open, and a drop-down listing each store with its accepted-track count and a switch to include or exclude it. Pressing Open accepted SHALL open every accepted track of the cart (all pages, within the store tab) in a new browser tab, once per track, in the first included store that carries it, using the track's store page or else its release page. The button SHALL be disabled when there is nothing to open. If the browser blocks some of the tabs, the page SHALL say how many were blocked and that pop-ups must be allowed for the site.

#### Scenario: Opening accepted tracks

- **WHEN** a cart has 3 accepted Beatport tracks and 2 accepted Bandcamp tracks, both stores are included, and pop-ups are allowed
- **THEN** pressing Open accepted opens 5 tabs, each on that track's store page

#### Scenario: Excluding a store

- **WHEN** the owner switches Bandcamp off in the Open accepted drop-down
- **THEN** the button shows 3 and pressing it opens only the Beatport tracks

#### Scenario: Pop-ups blocked

- **WHEN** the browser blocks all but the first tab
- **THEN** one tab opens and a notice says 4 tabs were blocked and pop-ups must be allowed for the site

#### Scenario: Nothing accepted

- **WHEN** the cart has no accepted tracks in the selected store tab
- **THEN** Open accepted is disabled

### Requirement: Remove or move rejected tracks with undo

While review is on, the bar SHALL offer **Modify rejected** with the number of rejected tracks, opening a drop-down that can remove all rejected tracks (all pages, within the store tab) from the cart, move them to one of the owner's other carts, or move them to a new cart named in the drop-down. Moved tracks SHALL arrive in the target cart as to review; tracks already in the target cart SHALL stay there unchanged. After either action a notice SHALL say how many tracks were removed or moved and where, with an **Undo** button that puts the tracks back in the cart in their original position, rejected, and removes from the target cart only the tracks the move added. The button SHALL be disabled when there are no rejected tracks.

#### Scenario: Remove rejected

- **WHEN** a cart has 3 rejected tracks and the owner chooses Remove from this cart
- **THEN** the 3 tracks leave the cart and a notice says "Removed 3 rejected tracks from this cart." with Undo

#### Scenario: Move rejected to another cart

- **WHEN** the owner moves 3 rejected tracks to the cart "To check later", which already holds one of them
- **THEN** all 3 leave the source cart, the 2 new ones appear in "To check later" as to review, and the one already there is unchanged

#### Scenario: Undo a move

- **WHEN** the owner presses Undo on the notice after that move
- **THEN** the 3 tracks are back in the source cart, rejected, in their original order
- **AND** "To check later" no longer holds the 2 tracks the move added but still holds the one it already had

#### Scenario: Store tab limits the action

- **WHEN** the Bandcamp store tab is selected and the owner removes rejected tracks
- **THEN** only rejected Bandcamp tracks are removed

### Requirement: Swiping to decide on a phone

On touch devices, while review is on, swiping a cart track row right past the threshold SHALL accept the track and swiping left past the threshold SHALL reject it. Past the threshold the revealed area SHALL read "Release to accept" or "Release to reject". Releasing before the threshold SHALL change nothing, and a swipe toward the state the track already has SHALL stop short and change nothing. Each swipe decision SHALL show a notice naming the track with an Undo button that restores the previous state. The existing swipe that marks tracks heard in the New, Recent and Heard lists SHALL be unchanged.

#### Scenario: Swipe right accepts

- **WHEN** the owner swipes a to-review row 100 px to the right on a phone and releases
- **THEN** the track is accepted and a notice "Accepted <title>" with Undo appears

#### Scenario: Short swipe does nothing

- **WHEN** the owner swipes a row 40 px to the left and releases
- **THEN** the row slides back and the state is unchanged

#### Scenario: Undo a swipe

- **WHEN** the owner presses Undo on the notice after rejecting a track by swiping
- **THEN** the track is back in its previous state

### Requirement: Empty To review tab

When the To review tab has no tracks, the table SHALL say "Nothing left to review here. Open the accepted tracks, or deal with the rejected ones."; other empty tabs SHALL say "No tracks here."

#### Scenario: All tracks decided

- **WHEN** every track in the selected store tab is accepted or rejected and To review is selected
- **THEN** the table shows "Nothing left to review here. Open the accepted tracks, or deal with the rejected ones."
