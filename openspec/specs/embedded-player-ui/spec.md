# Embedded player UI

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
