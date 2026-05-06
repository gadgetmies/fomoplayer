# Bandcamp track actions

## Purpose

Behaviour of the Fomo Player browser extension's per-track action buttons (currently "Add to Fomo Player") injected into Bandcamp release pages and track pages.
## Requirements
### Requirement: Add-to-Fomo-Player button does not navigate the page

When a user clicks the "Add to Fomo Player" button injected next to a track on a Bandcamp release page or track page, the button SHALL add the track and the browser MUST remain on the current page. The click MUST NOT trigger Bandcamp's track-row navigation.

#### Scenario: Adding from a release page keeps the user on the release

- **WHEN** the user is on a Bandcamp release page with multiple tracks and clicks the "Add to Fomo Player" button next to one of those tracks
- **THEN** the track is added to Fomo Player and the browser stays on the release page (no navigation to the track's standalone page).

#### Scenario: Adding from a track page still works

- **WHEN** the user is on a Bandcamp track page and clicks the "Add to Fomo Player" button
- **THEN** the track is added to Fomo Player without regression in behaviour.

### Requirement: Cart row shows in-flight, success, and error feedback

When a user clicks a cart entry inside the "Add to Fomo Player" dropdown, the clicked row SHALL reflect the request lifecycle in place: a loading indication while the request is in flight, a success indication on completion, or an error indication on failure. The user MUST NOT need to look elsewhere in the popup or the page to know that the click registered.

#### Scenario: Loading indicator on the clicked row

- **WHEN** the user clicks a cart row in the dropdown to add the current track
- **THEN** the clicked row immediately shows a loading indicator (spinner) replacing its leading icon, the row's text appears muted, and no other row visibly changes.

#### Scenario: Success indication after a successful add

- **WHEN** the worker responds that the add succeeded
- **THEN** the clicked row briefly shows a success indication (check icon, success-tinted background) before the dropdown closes, and no duplicate add was issued by intermediate clicks on the same row.

#### Scenario: Error indication after a failed add

- **WHEN** the worker responds that the add failed (network error, server error, or any other non-ok response)
- **THEN** the clicked row shows an error indication (warning icon, error-tinted background) with the worker's error message visible inline under the row text, the dropdown stays open, and the row remains clickable so the user can retry.

### Requirement: Clicked cart row blocks re-entry until the request settles

While a cart-add (or cart-remove) request is in flight for a given row, the dropdown SHALL ignore further clicks on that same row. Clicks on other rows during the same window MUST still be honoured.

#### Scenario: Double-click on the same row issues only one add

- **WHEN** the user clicks the same cart row twice in rapid succession before the first request settles
- **THEN** only one `bandcamp:add-to-cart` request is issued and the row reaches a single success or error state.

#### Scenario: Click on a different row during an in-flight add

- **WHEN** the user has an in-flight add for cart A and clicks cart B while cart A is still loading
- **THEN** cart B's row enters its own loading state and issues its own request independently of cart A.

### Requirement: Create-and-add control shows the same feedback lifecycle

When the user enters a name and clicks the "+" (create new cart) control inside the dropdown, the "+" control SHALL show the same loading, success, and error states as a cart row, covering both the create step and the subsequent add step as a single user-perceived action.

#### Scenario: Loading indicator on the create button

- **WHEN** the user submits a new cart name via the "+" button
- **THEN** the "+" button immediately shows a loading indicator in place of the "+" icon and is disabled until the create-and-add sequence settles.

#### Scenario: Success closes the dropdown after create-and-add

- **WHEN** both the create-cart and the subsequent add-to-cart requests succeed
- **THEN** the "+" button briefly shows a success indication and the dropdown closes.

#### Scenario: Error keeps the dropdown open with a recoverable message

- **WHEN** either the create-cart or the add-to-cart request fails
- **THEN** the "+" button shows an error indication, the worker's error message is visible inside the popup, the cart name input keeps its value, and the user can retry without reopening the dropdown.

### Requirement: Remove-from-cart row uses the same feedback lifecycle

When the dropdown surfaces a row whose track is already in a cart (per the `bandcamp-track-actions` capability extended by item 009) and the user clicks that row to remove the track, the row SHALL show the same loading, success, and error states defined for the add path. The same re-entry guard MUST apply.

#### Scenario: Loading indicator on a remove click

- **WHEN** the user clicks an already-in-cart row to remove the track
- **THEN** that row immediately shows a loading indicator and ignores further clicks until the remove request settles.

#### Scenario: Success indication after a successful remove

- **WHEN** the worker responds that the remove succeeded
- **THEN** the row shows a success indication appropriate to "removed" (check icon, success-tinted background) and the dropdown updates the row's membership state without closing (so the user can immediately add to another cart).

#### Scenario: Error indication after a failed remove

- **WHEN** the worker responds that the remove failed
- **THEN** the row shows the error indication with the worker's error message inline, the dropdown stays open, and the row remains clickable so the user can retry.

### Requirement: In-flight cart requests time out after a bounded wait

A cart-add, cart-remove, or create-and-add request that does not receive a worker response within a bounded wait (15 seconds) SHALL be surfaced as an error state on the originating row or "+" button, rather than leaving the loading indicator spinning indefinitely.

#### Scenario: Worker silence surfaces a timeout error

- **WHEN** the user clicks a cart row and the worker does not respond within the bounded wait
- **THEN** the row exits the loading state, shows the error indication, and surfaces a "Request timed out" message inline so the user can retry.

### Requirement: Per-row Play button appends and starts playback

Each Bandcamp track row that already receives Fomo Player per-row controls SHALL also expose a "Play" button adjacent to the existing per-row "Queue" button, and activating it SHALL append the row's track to the end of the Fomo Player queue and immediately start playback of that newly appended track. The action MUST NOT replace, reorder, or remove any existing queue contents, and MUST NOT trigger Bandcamp's own track-row navigation.

#### Scenario: Play from a release with an empty queue

- **WHEN** the Fomo Player queue is empty and the user clicks "Play" on a track row of a Bandcamp release page
- **THEN** that track is appended to the queue, becomes the active track, and playback starts.

#### Scenario: Play from a release with an existing queue preserves prior tracks

- **WHEN** the Fomo Player queue already contains one or more tracks and the user clicks "Play" on a track row of a Bandcamp release page
- **THEN** the clicked track is appended at the end of the queue (the prior tracks remain in their original order and are not removed), the appended track becomes the active track, and playback starts from it.

#### Scenario: Play does not navigate the page

- **WHEN** the user clicks "Play" on a track row of a Bandcamp release page or single-track page
- **THEN** the browser remains on the current page; Bandcamp's own track-row click handler does not navigate to the track's standalone page.

### Requirement: Per-row Play button shares the Queue button's visual and feedback treatment

The injected "Play" button SHALL use the same visual style and loading / error feedback lifecycle as the existing per-row "Queue" button so the two read as a single button group, and the button MUST ignore further clicks while its own request is in flight.

#### Scenario: Loading indicator on click

- **WHEN** the user clicks "Play" on a track row
- **THEN** the Play button immediately enters its loading state (label hidden, spinner visible, disabled) and remains there until the service worker responds or the request times out.

#### Scenario: Error indication on a failed play

- **WHEN** the service worker responds that the enqueue-and-play failed, or the request times out
- **THEN** the Play button briefly shows its error indication (error-tinted border, error tooltip) and then returns to its idle state so the user can retry.

#### Scenario: Re-entry guard during in-flight click

- **WHEN** the user clicks the same Play button twice in rapid succession before the first request settles
- **THEN** only one `bandcamp:enqueue` request with `playNow: true` is issued for that row.

### Requirement: Per-row injection remains idempotent with the new button

Per-row injection SHALL remain idempotent under MutationObserver-driven re-injection, and each track row MUST contain exactly one Play button, one Queue button, and one "Add to Fomo Player" cart control.

#### Scenario: Mutation-driven re-injection does not duplicate buttons

- **WHEN** the page's track table mutates (e.g. Bandcamp re-renders the row, or another script appends nodes) and the extension's injection pass runs again
- **THEN** each track row continues to expose exactly one Play, one Queue, and one Add-to-Fomo-Player control — no duplicate buttons are added.

### Requirement: Release-level Play button appends the release and starts playback

The release-level Fomo Player button group SHALL include a "Play" control alongside the existing release-level "Queue" and "Add to Fomo Player" controls — both in the title-section group on Bandcamp release / track pages and in the per-tile group on the discography grid — and activating it SHALL append every track of that release to the end of the Fomo Player queue in source order and immediately start playback of the first appended track. The action MUST NOT replace, reorder, or remove any existing queue contents, MUST NOT navigate the page, and the button MUST share the same visual style and loading / error feedback lifecycle as the release-level "Queue" button it sits next to.

#### Scenario: Title-section Play on a multi-track album

- **WHEN** the user clicks the title-section "Play" control on a Bandcamp album page that has multiple tracks
- **THEN** every track of the album is appended to the queue in source order, the first appended track becomes active, and playback starts.

#### Scenario: Title-section Play on a single-track page

- **WHEN** the user clicks the title-section "Play" control on a Bandcamp `/track/...` page
- **THEN** the single track is appended to the queue, becomes active, and playback starts.

#### Scenario: Release Play preserves prior queue contents

- **WHEN** the Fomo Player queue already contains tracks and the user clicks any release-level "Play" control
- **THEN** the prior queue contents remain in their original order and position, the release's tracks are appended after them, and playback starts from the first appended track.

#### Scenario: Discography-grid Play on a release tile

- **WHEN** the user clicks the "Play" control on a release tile in a Bandcamp discography grid
- **THEN** the extension fetches the release, appends all of its tracks to the queue, starts playback of the first appended track, and the browser does not navigate to the release page.

#### Scenario: Release-level injection stays idempotent with the new button

- **WHEN** the page mutates and the injection pass runs again on a release page or discography grid that already has the Fomo Player buttons
- **THEN** the title-section and each discography tile continue to expose exactly one Play, one Queue, and one Add-to-Fomo-Player control — no duplicate buttons are added.

### Requirement: Feed-page entries expose Play, Queue, and Add-to-Fomo-Player controls

Each playable feed entry on `https://bandcamp.com/<user>/feed` (an entry whose card links out to a Bandcamp `/album/...` or `/track/...` URL) SHALL receive the same Play, Queue, and Add-to-Fomo-Player controls injected on discography tiles. Play MUST fetch the linked release, append every track to the end of the Fomo Player queue in source order, start playback of the first appended track, and not navigate the browser. Queue MUST append every track of the linked release to the end of the queue without starting playback. Add-to-Fomo-Player MUST open the cart dropdown for the linked release, matching the dropdown behaviour already defined for discography tiles.

#### Scenario: Play on a feed entry linking to an album

- **WHEN** the user is on `https://bandcamp.com/<user>/feed` and clicks Play on a feed entry whose card links to `/album/...`
- **THEN** the linked release is fetched, every track is appended to the Fomo Player queue in source order, the first appended track becomes active and playback starts, and the browser stays on the feed page.

#### Scenario: Queue on a feed entry linking to a track

- **WHEN** the user clicks Queue on a feed entry whose card links to `/track/...`
- **THEN** that single track is appended to the end of the Fomo Player queue, playback does not start automatically, and the browser stays on the feed page.

#### Scenario: Add-to-Fomo-Player on a feed entry

- **WHEN** the user clicks the Add-to-Fomo-Player control on a feed entry
- **THEN** the cart dropdown opens for the linked release with the same in-flight, success, and error feedback already defined for discography tiles.

#### Scenario: Non-playable feed entries are skipped

- **WHEN** a feed entry is a community post, "now following" notification, or any other entry without an `/album/...` or `/track/...` link
- **THEN** no Fomo Player controls are injected on that entry.

### Requirement: Feed-page injection stays idempotent and survives feed virtualisation

The feed injector SHALL be idempotent under repeated runs and SHALL inject controls on entries that Bandcamp adds after initial render (infinite scroll, "load more" buttons, virtualised re-mounts). Each playable feed entry MUST contain exactly one Play, one Queue, and one Add-to-Fomo-Player control regardless of how many times the injection pass has run.

#### Scenario: Re-injection does not duplicate buttons

- **WHEN** the feed page mutates (Bandcamp re-renders an entry, or another script appends nodes) and the extension's injection pass runs again
- **THEN** each playable feed entry continues to expose exactly one Play, one Queue, and one Add-to-Fomo-Player control.

#### Scenario: Lazy-loaded feed entries get controls

- **WHEN** the user scrolls the feed and Bandcamp inserts further story entries into the DOM
- **THEN** the new entries receive Play, Queue, and Add-to-Fomo-Player controls within the same debounce window the other Bandcamp surfaces use.

### Requirement: Per-row injected controls mount immediately after the .time span

On every Bandcamp track row that receives Fomo Player per-row controls, the `[data-fp-injected]` wrap SHALL be inserted as the immediate next sibling of the row's `.time` span. The wrap MUST NOT carry a left-margin shim — the row's natural cell spacing handles the gap. When a row has no `.time` span (e.g. unusual pre-release variants), the wrap MAY fall back to the previous append-into-cell placement so those rows continue to receive controls without regression.

#### Scenario: Wrap is .time's next sibling on a standard release row

- **WHEN** the extension injects per-row controls on a Bandcamp release page's track row
- **THEN** the row contains a `.time` span and the `[data-fp-injected]` wrap is the immediate `nextElementSibling` of that span.

#### Scenario: No left-margin shim is applied to the wrap

- **WHEN** the extension renders the per-row `[data-fp-injected]` wrap
- **THEN** the wrap's inline style does not include a `margin-left` rule.

#### Scenario: Re-injection does not duplicate the wrap

- **WHEN** the page mutates and the injection pass runs again on a row whose `[data-fp-injected]` wrap already exists
- **THEN** that row continues to expose exactly one wrap as the immediate next sibling of `.time`.

#### Scenario: Rows without .time fall back gracefully

- **WHEN** a track row has no `.time` span but is otherwise eligible for injection
- **THEN** the wrap is appended into the row's title cell so the row still exposes the Fomo Player controls.

### Requirement: Buttons in a `[data-fp-injected]` wrap share a single vertical centre line

The Play, Queue, and Add-to-Fomo-Player buttons inside a single `[data-fp-injected]` wrap SHALL render with their visual centres on the same horizontal line within 1px of each other, on every Bandcamp surface that injects them (release-title section, per-track rows, discography overlays, and the feed). The wrap MUST anchor its inline-flex layout with `align-items: center`, and each button's shadow-host MUST present a centre-aligned layout so that intrinsic baseline differences (e.g. the cart toggle's SVG icon) cannot offset one button below the others.

#### Scenario: Per-track row buttons line up

- **WHEN** the extension renders a per-track Play / Queue / Add-to-Fomo-Player trio in a Bandcamp release page row
- **THEN** the visual centres of all three buttons sit on the same horizontal line within 1px.

#### Scenario: Release-title buttons line up

- **WHEN** the extension renders the release-title `Play` / `Queue` / `Add to Fomo` trio
- **THEN** the visual centres of all three buttons sit on the same horizontal line within 1px.

#### Scenario: Discography-overlay buttons line up

- **WHEN** the extension renders Play / Queue / Add-to-Fomo-Player on a `#music-grid` tile overlay
- **THEN** the visual centres of all three buttons sit on the same horizontal line within 1px.

#### Scenario: SVG icon does not pull the cart toggle off-centre

- **WHEN** the cart-toggle button renders with its SVG cart icon next to its label
- **THEN** the SVG is anchored such that the button's intrinsic vertical centre matches the cue-button siblings (no baseline-induced offset).

### Requirement: Cart toggle reads "Add to Fomo" on every surface

The cart-toggle button SHALL render with the label "Add to Fomo" next to its cart icon on every Bandcamp surface (release-page title section, per-track rows, discography overlays, and the feed). On compact feed tiles where the trio is rendered icon-only, the label MUST be hidden (the cart icon alone stands in) but the accessible name MUST still resolve to "Add to Fomo" so screen readers and tooltips remain meaningful.

#### Scenario: Cart label reads "Add to Fomo" on a release row

- **WHEN** the extension renders the cart-toggle on a Bandcamp release page's title section, per-track row, discography tile overlay, or full feed entry
- **THEN** the button shows the cart icon followed by the label "Add to Fomo".

#### Scenario: Compact feed tiles use the cart icon alone

- **WHEN** the extension renders the cart-toggle on a `#new-releases-vm` feed tile
- **THEN** the button shows the cart icon with no visible label, and its accessible name (tooltip / `title`) reads "Add to Fomo".

### Requirement: Bandcamp button trio shares a unified palette

Every Fomo Player button injected into Bandcamp (Play, Queue, and Add-to-Fomo cart toggle, on every surface) SHALL render in a single unified palette: transparent background, `1px` `#b40089` border, `#fff` text in idle state, with hover filling the button `#b40089` and keeping text `#fff`. Loading and error indications stay layered on top of this palette.

#### Scenario: Buttons render with the unified palette

- **WHEN** the extension renders the Fomo Player button trio on any Bandcamp surface
- **THEN** each button's idle state shows a transparent fill with a `#b40089` border and white text, and hovering fills the button `#b40089`.

### Requirement: `[data-fp-injected]` wrap carries a legibility backdrop on every surface

The `[data-fp-injected]` wrap that hosts the button trio MUST render with a transparent body and only a soft drop shadow behind it (`box-shadow: 0 2px 12px 4px rgba(0, 0, 0, 0.45)` with `border-radius: 6px`). The wrap MUST NOT paint a semi-transparent dark wash, a `backdrop-filter` blur on the page content underneath, or any other visible rectangle in front of the page chrome — softening is provided by the diffuse drop shadow alone, and the buttons rely on their own brand-coloured border for definition.

#### Scenario: Wrap renders with the drop shadow on every surface

- **WHEN** the extension renders the `[data-fp-injected]` wrap on a release-page title section, per-track row, discography tile overlay, or feed entry
- **THEN** the wrap's inline style declares `box-shadow: 0 2px 12px 4px rgba(0, 0, 0, 0.45)` and `border-radius: 6px`, painting a soft-edged dark drop shadow behind the container

#### Scenario: Wrap has no visible body

- **WHEN** the wrap renders on any Bandcamp surface
- **THEN** the wrap's inline style does NOT include a `background` declaration painting a semi-transparent dark colour, and does NOT include `backdrop-filter` / `-webkit-backdrop-filter` declarations — page content directly underneath the buttons is visible without any wash or blur on top of it

#### Scenario: Drop shadow is diffuse, not a hard halo

- **WHEN** the wrap renders on any Bandcamp surface
- **THEN** the `box-shadow` value uses a 12px blur radius and a 4px spread so the shadow fades softly into the page rather than painting a sharp-edged halo

### Requirement: Compact feed tiles render the trio as icons only

On `#new-releases-vm` feed tiles — Bandcamp's compact "from artists you follow" panel — the button trio SHALL render icon-only (a play triangle, a plus, and the cart icon), with text labels suppressed so the buttons fit the tile's narrow horizontal space. On every other Bandcamp surface — including the full-width `#stories` feed entries — text labels MUST remain visible.

#### Scenario: Compact tiles drop the labels

- **WHEN** the extension renders the button trio on a `#new-releases-vm` feed tile
- **THEN** the Play button shows a play-triangle icon, the Queue button shows a plus icon, the cart toggle shows the cart icon, and no text label is visible on any of them.

#### Scenario: Full-width feed entries keep the labels

- **WHEN** the extension renders the button trio on a `#stories` feed entry
- **THEN** the buttons show their text labels ("Play", "Queue", "Add to Fomo") next to or in place of icons, just as on the release page and discography tiles.

### Requirement: Cart dropdown surfaces current cart membership for the release

When the user opens the "Add to Fomo Player" dropdown for a Bandcamp release or track, each cart row SHALL render in one of two visual states: not-in-cart (cart-add icon, default idle background) or in-cart (a "remove from cart" icon and a subtle "already-set" background tint). A cart row SHALL be marked in-cart when the cart contains at least one of the FP track IDs that the release's tracks resolve to. The dropdown MUST request membership data on open and reflect it before accepting the user's first click.

#### Scenario: Cart that already holds the release's track is marked in-cart

- **WHEN** the user opens the dropdown for a Bandcamp track that is in cart "House Picks"
- **THEN** the "House Picks" row renders with the in-cart icon and tint, distinct from rows for carts that do not contain the track.

#### Scenario: Cart that does not hold the release's tracks is marked not-in-cart

- **WHEN** the user opens the dropdown for a Bandcamp track that no cart contains
- **THEN** every cart row renders with the not-in-cart icon and the default idle background.

### Requirement: Clicking an in-cart row removes and flips the row in place

When the user clicks a row that is currently rendered in the in-cart state, the dropdown SHALL dispatch a remove of the row's known FP track IDs from that cart. On success, the row MUST flip to the not-in-cart state in place without closing the dropdown so the user can immediately act on another cart. On failure, the row MUST show the existing error indication and remain clickable for retry.

#### Scenario: Successful remove flips the row in place

- **WHEN** the user clicks an in-cart row and the worker confirms the remove
- **THEN** the row flips to the not-in-cart state (cart-add icon, default tint), the dropdown stays open, and a subsequent click on the same row issues an add.

#### Scenario: Failed remove keeps the row clickable

- **WHEN** the user clicks an in-cart row and the worker reports a failure (network or server error, or timeout)
- **THEN** the row shows the error indication with the worker's message inline, the row stays in the in-cart state, and the row remains clickable so the user can retry.

### Requirement: Clicking a not-in-cart row adds and flips the row in place

When the user clicks a row that is currently rendered in the not-in-cart state, the dropdown SHALL dispatch the existing add path. On success, the row MUST flip to the in-cart state in place — the dropdown does not close immediately, so the user can immediately act on another cart in the same dropdown session.

#### Scenario: Successful add flips the row in place

- **WHEN** the user clicks a not-in-cart row and the worker confirms the add
- **THEN** the row flips to the in-cart state (remove icon, in-cart tint) and the dropdown stays open; a subsequent click on the same row issues a remove.

### Requirement: Single round-trip on dropdown open

The dropdown SHALL learn each cart's membership for the current release in a single response from the worker. The worker MAY fan out internally to fetch per-cart track lists in parallel, but the popup MUST NOT see more than one network round-trip on open.

#### Scenario: Open issues a single membership request

- **WHEN** the user opens the dropdown for a Bandcamp release
- **THEN** the popup sends one `bandcamp:get-carts` message carrying the release payload, and renders rows once that message returns with each cart annotated.

