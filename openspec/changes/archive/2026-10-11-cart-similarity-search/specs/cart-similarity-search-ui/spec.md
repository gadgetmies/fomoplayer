## ADDED Requirements

### Requirement: Find similar from a cart

The cart view SHALL show a "Find similar" button that starts a search with the term `cart:~<cart uuid>`, shown in
the search bar as a cart pill with the cart's name. Typing or pasting `cart:~<uuid>` into the search bar SHALL run
the same search.

#### Scenario: Starting from the cart view
- **WHEN** the user opens a cart and presses "Find similar"
- **THEN** the search results show tracks similar to that cart and the search bar shows the cart pill

### Requirement: Cart search controls

The results header SHALL show, on one row (also on a phone) and without moving when values change: a group-count
stepper (a "−" coarser button, a box holding the number of groups and a "+" finer button) over 1…`maxK` groups
starting at the automatic value, a "New artists only" toggle, and a "Map" toggle in the app's select-button style
(secondary blue when on) on a background darker than the controls row. A number typed into the box SHALL be applied
on Enter or blur, clamped to 1…`maxK`. No group-count or "(auto)" label SHALL be shown. The result count and the
numbers of heard, ignored and purchased tracks left out SHALL be shown after the controls.

#### Scenario: Changing the group count
- **WHEN** the user presses "+" with 2 groups shown, or types 3 into the box and presses Enter
- **THEN** the results are re-fetched with `k=3`, three group chips are shown and the other controls stay in place

#### Scenario: Controls on a phone
- **WHEN** the results are shown on a phone-width screen
- **THEN** the stepper, New artists only and Map share a single row without overflowing it

### Requirement: Group chips and save group as cart

The header SHALL show an app select-button group with "All" and one chip per group (coloured dot, group name, result
count) on a background darker than the controls row; the active chip SHALL use the secondary blue. The chips SHALL
stay on a single row that scrolls horizontally when they do not fit, instead of wrapping. "All" SHALL list the results of all groups ordered by Fit; a
group chip SHALL list only that group's results. A "Save group as cart" button SHALL be visible at all times, disabled
while "All" is selected, and when a group is selected it SHALL create a new cart, named by the user (pre-filled), from
the group's own cart tracks.

#### Scenario: Saving a group
- **WHEN** the user selects a group chip, presses "Save group as cart" and confirms the name
- **THEN** a new cart with that name exists containing exactly the group's tracks from the searched cart

### Requirement: Fit pill and Not this column

Each result row SHALL show its Fit as a pill containing the group's coloured dot and the number, centred in the
column, with a tooltip explaining the group, the scale, the percentage of group tracks it is closer than, and the next
best group. A "Not this" column SHALL hold a purple primary "Not this" button per row. Pressing it SHALL hide the track,
add it to a "Not this" list in the header (with undo per track and "Clear all"), and re-run the search with the misses.
The misses SHALL live only in the browser session. On a phone-width screen the Fit pill, the cart button and the "Not
this" button SHALL be stacked in one column beside the track details, all of the same width.

#### Scenario: Result actions on a phone
- **WHEN** the results are shown on a phone-width screen
- **THEN** each row shows Fit, the cart button and "Not this" one below the other, left-aligned and equally wide

#### Scenario: Marking a result
- **WHEN** the user presses "Not this" on a result
- **THEN** the track disappears from the list, appears in the "Not this" list, and the search is repeated with it as a miss

### Requirement: Map behind a toggle

When the Map toggle is on, a 2D map SHALL show the cart's grouped tracks as filled dots and the listed results as
rings, coloured by group, with other groups dimmed when a single group is selected. Clicking a ring SHALL highlight its
row. The map SHALL be hidden by default.

#### Scenario: Opening the map
- **WHEN** the user turns the Map toggle on
- **THEN** the map appears above the results and the toggle shows its active (blue) state
