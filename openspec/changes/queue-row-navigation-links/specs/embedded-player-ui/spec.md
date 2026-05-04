## ADDED Requirements

### Requirement: Queue rows expose Track, Release, and Artist navigation links

Each row in the embedded player's queue panel SHALL render Track, Release, and Artist links as ordinary `<a href="…">` elements pointing at the source store's track / release / artist pages. The links MUST navigate the current tab on plain click and respect standard "open in new tab" modifier clicks (Cmd/Ctrl-click, middle-click, right-click context menu).

#### Scenario: Plain click navigates the current tab

- **WHEN** the user clicks a queue row's "Track" link with no modifier key
- **THEN** the browser navigates the current tab to the track's source page.

#### Scenario: Modifier-click opens a new tab

- **WHEN** the user middle-clicks or Cmd/Ctrl-clicks a queue row's "Release" or "Artist" link
- **THEN** the browser opens that page in a new tab without affecting the current tab or the embedded player's playback state.

### Requirement: Optional Label link is rendered only when distinct

When a queued track has a label URL different from its artist URL, the row SHALL render a Label link alongside Track / Release / Artist. When no label URL is available — or when the label URL equals the artist URL — the row MUST omit the Label link entirely rather than render an inert or empty placeholder.

#### Scenario: Label distinct from artist renders the link

- **WHEN** the queue row's track carries a `labelUrl` that differs from its `artistUrl`
- **THEN** the row renders a Label link in addition to Track, Release, and Artist.

#### Scenario: Missing or redundant label URL omits the link

- **WHEN** the queue row's track has no `labelUrl`, or its `labelUrl` matches its `artistUrl`
- **THEN** the row renders only Track, Release, and Artist — there is no Label affordance on the row.

### Requirement: Link clicks do not start playback or change the active track

Clicking a queue row's Track / Release / Artist / Label link MUST NOT change the active track or start playback. The row's existing "play this track" behaviour SHALL remain intact for clicks elsewhere on the row, and the remove (X) button SHALL continue to work as before.

#### Scenario: Link click leaves playback alone

- **WHEN** the user clicks any of the row's navigation links
- **THEN** the embedded player does not dispatch `audio:play-at` and the active track / playing state stays as it was.

#### Scenario: Click on the rest of the row still plays

- **WHEN** the user clicks the row outside any link or the remove button
- **THEN** the embedded player dispatches `audio:play-at` for that row's index, just as before.

#### Scenario: Remove button still works

- **WHEN** the user clicks the row's remove (X) button
- **THEN** the row is removed from the queue and no link or play action is triggered.
