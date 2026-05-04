## ADDED Requirements

### Requirement: Queue-toggle button is labelled "Open queue"

The button in the embedded player that toggles the queue panel SHALL display the text "Open queue". Its accessible name (`aria-label`) and hover tooltip (`title`) MUST also be "Open queue".

#### Scenario: Visible label reads "Open queue"

- **WHEN** the embedded player is rendered on a Bandcamp page
- **THEN** the queue-toggle button shows "Open queue" as its visible text.

#### Scenario: Accessible name and tooltip match the visible label

- **WHEN** an assistive technology focuses the queue-toggle button, or a sighted user hovers it
- **THEN** the announced name and the hover tooltip both read "Open queue".
