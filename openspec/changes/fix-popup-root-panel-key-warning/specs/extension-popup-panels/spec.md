## ADDED Requirements

### Requirement: Popup panel list renders with stable React keys

The popup's panel list rendered by
`packages/browser-extension/src/js/popup/Root.jsx` SHALL pass a unique,
stable `key` prop to each rendered panel element. The key SHALL be
derived from a per-panel identifier defined on the panel itself (not
from the panel's array index and not from the rendered component's
class name), so that reorders of the panel list — including the
`[current, …rest]` reordering that happens when the active tab's host
changes — preserve each panel's local React state instead of
re-mounting it.

#### Scenario: Opening the popup does not log a React key warning

- **WHEN** the user opens the extension popup on any host (FomoPlayer,
  Beatport, Bandcamp, or an unrelated site)
- **THEN** the browser console contains no
  `Each child in a list should have a unique "key" prop` warning
  attributable to `Root`.

#### Scenario: Panel local state survives a reorder

- **GIVEN** the popup is open and the user has interacted with a panel
  in a way that creates local component state (for example, typing
  into a text input that the panel owns)
- **WHEN** the active tab's hostname changes so that a different panel
  becomes `current` and the `enabledPanels` list reorders
- **THEN** the panel the user was interacting with retains its local
  state — React reuses the existing component instance rather than
  unmounting and re-mounting it.

#### Scenario: The FomoPlayer (app) panel has a stable identifier

- **GIVEN** the popup's panel list includes the `MultiStorePlayerPanel`
  entry, which represents the FomoPlayer app rather than a third-party
  store
- **WHEN** `Root` renders the panel list
- **THEN** the `MultiStorePlayerPanel` entry SHALL contribute a stable
  per-panel identifier (e.g. `storeName: 'fomoplayer'`) so its React
  key is non-null and distinct from every other panel's key.

#### Scenario: Panel filter behaviour is unchanged

- **GIVEN** `enabledStores` controls which third-party panels are
  rendered (via `R.path(['enabledStores', panel.storeName], state)` at
  `Root.jsx:102-105`)
- **WHEN** an `enabledStores` entry is missing for a given panel's
  identifier (for example, no `enabledStores.fomoplayer` key exists)
- **THEN** the panel SHALL remain enabled — the filter falls through
  to "enabled" for any `undefined` lookup, matching the behaviour
  before this change.
