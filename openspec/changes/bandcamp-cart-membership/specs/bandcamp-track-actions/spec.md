## ADDED Requirements

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
