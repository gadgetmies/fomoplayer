## ADDED Requirements

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
