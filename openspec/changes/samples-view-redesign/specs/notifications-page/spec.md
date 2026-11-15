## ADDED Requirements

### Requirement: Samples MUST open a sample's content under its own row

Each sample SHALL be a row with a play button, its name and match count, a
delete button and an open/close chevron at the end of the row. Activating the
row, except the play and delete buttons, SHALL open that sample's content
directly under its row and close any other open sample. At most one sample is
open at a time.

#### Scenario: Opening another sample
- **WHEN** sample A is open and the user activates sample B's row
- **THEN** B's content shows directly under B's row, A's content is hidden and A's chevron points down

#### Scenario: Play does not open the sample
- **WHEN** the user presses the play button of a closed sample
- **THEN** the sample plays and its row stays closed

### Requirement: An open sample MUST show either its matches or its Sounds like list

The open sample's header bar SHALL contain a Matches / Sounds like toggle with
the number of matches. Only the selected list SHALL show. Matches SHALL be
selected when a sample is opened.

#### Scenario: Switching to Sounds like
- **WHEN** the user selects Sounds like in the open sample's header
- **THEN** the matches list is hidden and the similar tracks and follow suggestions show in its place

#### Scenario: Sample without matches
- **WHEN** the open sample has no matches and Matches is selected
- **THEN** the content says there is no match yet and points to Sounds like

### Requirement: Deleting a sample MUST be confirmed and kept apart from opening it

Every sample row SHALL have its own delete button that asks for confirmation
before deleting. The delete button SHALL be separated from the chevron by a
visible divider and spacing, and pressing it SHALL NOT open or close the row.

#### Scenario: Cancelled delete
- **WHEN** the user presses a sample's delete button and cancels the confirmation
- **THEN** the sample stays in the list and its open state does not change

#### Scenario: Confirmed delete
- **WHEN** the user confirms deleting the open sample
- **THEN** the sample disappears from the list

### Requirement: Samples on a phone MUST fit the screen width

At phone width the Samples tab SHALL NOT scroll sideways. Matches and similar
tracks SHALL be two-line rows: title on the first line, artist and label on
the second, with the matched-at time and tempo (matches) or similarity
(similar tracks) on the right.

#### Scenario: Match row on a phone
- **WHEN** the Samples tab is shown 390 px wide with an open sample that has matches
- **THEN** the page has no horizontal scroll and each match shows its title, artist · label and matched-at time

### Requirement: Follow suggestions MUST use the Follow-popup buttons

Each suggested artist or label in "Follow to catch it" SHALL be a large
primary Follow button with the heart icon, as in the Follow / unfollow popup,
reading "Follow <name>" with its number of similar tracks, one button per row,
grouped under Artists and Labels. Following one SHALL remove it from the
suggestions.

#### Scenario: Following a suggestion
- **WHEN** the user presses "Follow Saltwater Records"
- **THEN** the label is followed and its button no longer shows

### Requirement: A link MUST be able to open a given sample

`/notifications/samples?sample=<id>` SHALL open the Samples tab with sample
`<id>` open and scrolled into view. An id that is not one of the user's
samples SHALL open the tab with its default sample.

#### Scenario: Link from a match email
- **WHEN** the user follows `/notifications/samples?sample=7` and sample 7 is theirs
- **THEN** sample 7 is open with Matches selected and its row is in view

#### Scenario: Unknown sample id
- **WHEN** the user follows `/notifications/samples?sample=9999` and has no such sample
- **THEN** the Samples tab opens as it would without the parameter
