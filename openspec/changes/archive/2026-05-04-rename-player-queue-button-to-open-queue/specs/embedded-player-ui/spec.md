## ADDED Requirements

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
