# tracks-view-refresh-control Specification

## Purpose
TBD - created by archiving change restore-desktop-refresh-button. Update Purpose after archive.
## Requirements
### Requirement: Tracks view exposes a refresh affordance on every input modality

The tracks view (`new`, `recent`, and `heard` panels) SHALL expose at
least one user-triggerable affordance for refreshing the list without
reloading the page, on every input modality the application supports.
On touch devices the affordance is the existing pull-down gesture; on
non-touch / mouse-driven devices the affordance is a visible refresh
button. The `carts` panel is excluded from this requirement — it has
its own pagination controls and was not part of the historical refresh
affordance.

#### Scenario: Desktop user on the new panel sees a refresh button

- **WHEN** the user is on the `new` panel in a browser that matches
  `(hover: hover) and (pointer: fine)` (e.g. a desktop / laptop with a
  mouse or trackpad)
- **THEN** a refresh button is visible in the tracks-view footer area

#### Scenario: Desktop user on the recent or heard panel sees a refresh button

- **WHEN** the user is on the `recent` or `heard` panel in a browser
  that matches `(hover: hover) and (pointer: fine)`
- **THEN** a refresh button is visible in the tracks-view footer area

#### Scenario: Desktop user on the carts panel does not see a refresh button

- **WHEN** the user is on the `carts` panel in any browser
- **THEN** the refresh button is not rendered (the cart pagination
  controls remain unchanged)

#### Scenario: Touch user can still pull to refresh

- **WHEN** the user is on the `new`, `recent`, or `heard` panel on a
  touch device
- **THEN** pulling the track list down past the existing threshold and
  releasing triggers a refresh (the gesture continues to work as it
  does today)

### Requirement: Refresh affordances share a single in-flight state

The desktop refresh button and the pull-to-refresh gesture SHALL drive
the same refresh action and observe the same in-flight flag, so that
a refresh started by one affordance is reflected by the other.

#### Scenario: Both affordances call the same refresh path

- **WHEN** either the desktop refresh button is clicked or the
  pull-to-refresh gesture is released past its threshold
- **THEN** the same `refreshTracks` method is invoked, which calls
  `onUpdateTracksClicked` and toggles `state.updatingTracks` around
  the call

#### Scenario: Button reflects in-flight state during touch refresh

- **WHEN** a refresh is in flight (regardless of which affordance
  started it) on a device where the desktop button is rendered
- **THEN** the desktop refresh button shows its loading state
  (spinner) and is disabled until the refresh resolves or fails

#### Scenario: Button re-enables after refresh failure

- **WHEN** a refresh started from the desktop button fails (the
  promise from `onUpdateTracksClicked` rejects)
- **THEN** `state.updatingTracks` returns to `false` and the button
  becomes clickable again, so the user can retry without reloading
  the page

### Requirement: Non-touch detection prefers showing the button on ambiguity

The button-rendering gate SHALL use the
`(hover: hover) and (pointer: fine)` media query as its primary
signal. When the runtime cannot evaluate the query (e.g.
`window.matchMedia` is unavailable), the gate SHALL default to
showing the button rather than hiding it, on the rationale that a
duplicate affordance is preferable to a missing one.

#### Scenario: Hybrid touch laptop sees the button alongside the gesture

- **WHEN** the device matches `(hover: hover) and (pointer: fine)`
  and also exposes touch input (e.g. a Windows touch laptop, an iPad
  with a Magic Keyboard)
- **THEN** the desktop refresh button is rendered AND pull-to-refresh
  remains active — both affordances coexist by design

#### Scenario: Browser without matchMedia falls back to showing the button

- **WHEN** `window.matchMedia` is undefined or returns no result for
  the query
- **THEN** the button is rendered (the gate fails open)

#### Scenario: Phone without fine pointer hides the button

- **WHEN** the device does not match `(hover: hover) and (pointer:
  fine)` (e.g. a typical phone)
- **THEN** the desktop refresh button is not rendered and only the
  pull-to-refresh gesture is available

