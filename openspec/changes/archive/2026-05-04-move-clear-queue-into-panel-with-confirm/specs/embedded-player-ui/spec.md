## ADDED Requirements

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
