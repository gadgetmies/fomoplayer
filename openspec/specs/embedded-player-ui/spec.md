# Embedded player UI

## Purpose

The in-page Fomo Player UI the browser extension injects into Bandcamp pages — its labels, controls, and accessibility wiring.

## Requirements

### Requirement: Queue-toggle button label reflects panel visibility

The button in the embedded player that toggles the queue panel SHALL display "Show queue" while the queue panel is hidden and "Hide queue" while the queue panel is visible. Its accessible name (`aria-label`) and hover tooltip (`title`) MUST always match the visible text.

#### Scenario: Hidden panel — button reads "Show queue"

- **WHEN** the embedded player is rendered and the queue panel is hidden
- **THEN** the toggle button's visible text, `title`, and `aria-label` all read "Show queue".

#### Scenario: Visible panel — button reads "Hide queue"

- **WHEN** the user clicks the toggle button while the queue panel is hidden
- **THEN** the queue panel becomes visible
- **AND** the toggle button's visible text, `title`, and `aria-label` all read "Hide queue".

#### Scenario: Re-hiding the panel restores "Show queue"

- **WHEN** the user clicks the toggle button while the queue panel is visible, OR the player resets to its empty state
- **THEN** the queue panel is hidden
- **AND** the toggle button's visible text, `title`, and `aria-label` all read "Show queue".

### Requirement: Clear-queue control lives inside the queue panel

The control that clears the queue SHALL be presented inside the queue panel itself, not in the player-view controls row. The control MUST NOT be visible while the queue panel is hidden, and MUST be visible whenever the queue panel is visible.

#### Scenario: Player-view row has no clear-queue control

- **WHEN** the embedded player is rendered with the queue panel hidden
- **THEN** the player-view controls row does not contain a clear-queue button.

#### Scenario: Queue panel exposes the clear-queue control

- **WHEN** the user opens the queue panel
- **THEN** a "Clear queue" button is visible inside the queue panel.

#### Scenario: Clearing the panel does not destroy the clear-queue control

- **WHEN** the queue list is re-rendered (e.g. tracks added, removed, or the active row changes)
- **THEN** the "Clear queue" button remains in the panel without needing to be re-bound.

### Requirement: Clearing the queue requires confirmation

Activating the "Clear queue" control SHALL require an explicit confirmation step before the queue is cleared. Cancelling the confirmation MUST leave the queue and current playback unchanged.

#### Scenario: User confirms — queue clears

- **WHEN** the user clicks "Clear queue" and confirms the prompt
- **THEN** the extension dispatches the `audio:clear` action and the queue is emptied.

#### Scenario: User cancels — queue is preserved

- **WHEN** the user clicks "Clear queue" and cancels the prompt
- **THEN** no `audio:clear` action is dispatched and the queue and current playback remain unchanged.

### Requirement: Queue rows expose Track, Release, and Catalog navigation links

Each row in the embedded player's queue panel SHALL render Track, Release, and Catalog links as ordinary `<a href="…">` elements. The Track and Release links point at the source store's track and release pages; the Catalog link points at the artist's source-store page. Each link MUST navigate the current tab on plain click and respect standard "open in new tab" modifier clicks (Cmd/Ctrl-click, middle-click, right-click context menu).

#### Scenario: Plain click navigates the current tab

- **WHEN** the user clicks a queue row's "Track" link with no modifier key
- **THEN** the browser navigates the current tab to the track's source page.

#### Scenario: Modifier-click opens a new tab

- **WHEN** the user middle-clicks or Cmd/Ctrl-clicks a queue row's "Release" or "Catalog" link
- **THEN** the browser opens that page in a new tab without affecting the current tab or the embedded player's playback state.

### Requirement: Second Catalog link points at the label when distinct

When a queued track has a label URL different from its artist URL, the row SHALL render a second "Catalog" link alongside the artist Catalog link. The second link's `href` points at the label's source-store page; both links share the same visible label text "Catalog". When no label URL is available — or when the label URL equals the artist URL — the row MUST omit the second Catalog link entirely rather than render an inert or empty placeholder.

#### Scenario: Label distinct from artist renders a second Catalog link

- **WHEN** the queue row's track carries a `labelUrl` that differs from its `artistUrl`
- **THEN** the row renders two "Catalog" links: one whose `href` is the artist URL and one whose `href` is the label URL.

#### Scenario: Missing or redundant label URL omits the second Catalog link

- **WHEN** the queue row's track has no `labelUrl`, or its `labelUrl` matches its `artistUrl`
- **THEN** the row renders Track, Release, and exactly one Catalog link — no second Catalog affordance on the row.

### Requirement: Link clicks do not start playback or change the active track

Clicking any of the queue row's Track / Release / Catalog links MUST NOT change the active track or start playback. The row's existing "play this track" behaviour SHALL remain intact for clicks elsewhere on the row, and the remove (X) button SHALL continue to work as before.

#### Scenario: Link click leaves playback alone

- **WHEN** the user clicks any of the row's navigation links
- **THEN** the embedded player does not dispatch `audio:play-at` and the active track / playing state stays as it was.

#### Scenario: Click on the rest of the row still plays

- **WHEN** the user clicks the row outside any link or the remove button
- **THEN** the embedded player dispatches `audio:play-at` for that row's index, just as before.

#### Scenario: Remove button still works

- **WHEN** the user clicks the row's remove (X) button
- **THEN** the row is removed from the queue and no link or play action is triggered.
