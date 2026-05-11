# extension-popup-panels Specification

## Purpose
TBD - created by archiving change fix-popup-root-panel-key-warning. Update Purpose after archive.
## Requirements
### Requirement: Popup panel list SHALL render with stable React keys

The popup `Root` component (`packages/browser-extension/src/js/popup/Root.jsx`) SHALL pass a unique, stable `key` prop to each rendered panel element when iterating the panel list. The key SHALL be derived from a per-panel identifier defined on the panel itself — not from the panel's array index and not from the rendered component's class name — so that reorders of the panel list (including the `[current, …rest]` reordering that happens when the active tab's host changes) preserve each panel's local React state instead of re-mounting it.

#### Scenario: Opening the popup does not log a React key warning

- **WHEN** the user opens the extension popup on any host (FomoPlayer, Beatport, Bandcamp, or an unrelated site)
- **THEN** the browser console MUST NOT contain any `Each child in a list should have a unique "key" prop` warning attributable to `Root`.

#### Scenario: Panel local state survives a reorder

- **GIVEN** the popup is open and the user has interacted with a panel in a way that creates local component state (for example, typing into a text input that the panel owns)
- **WHEN** the active tab's hostname changes so that a different panel becomes `current` and the `enabledPanels` list reorders
- **THEN** the panel the user was interacting with MUST retain its local state — React reuses the existing component instance rather than unmounting and re-mounting it.

### Requirement: FomoPlayer app panel SHALL carry an explicit stable identifier

Every panel definition in `Root.jsx`'s `panels` array — including the `MultiStorePlayerPanel` entry that represents the FomoPlayer app rather than a third-party store — SHALL carry a non-null, distinct identifier (e.g. `storeName: 'fomoplayer'`) so that the React key derived from it is non-null and unique across the rendered panel list.

#### Scenario: FomoPlayer panel entry has a storeName

- **WHEN** a maintainer inspects the `panels` array in `Root.jsx`
- **THEN** every entry in the array MUST define a `storeName` (or equivalent per-panel identifier) field with a unique value.

### Requirement: Existing panel filter behaviour SHALL be preserved

The `enabledStores`-based filter at `Root.jsx:102-105` (`R.path(['enabledStores', panel.storeName], state)`) SHALL continue to fall through to "enabled" whenever the lookup returns `undefined`. Introducing a `storeName` on the FomoPlayer panel MUST NOT cause that panel to become hidable via `enabledStores` configuration that exists today — only `beatport` and `bandcamp` keys are written into `enabledStores` by the options page and the service worker.

#### Scenario: FomoPlayer panel stays visible without an enabledStores entry

- **GIVEN** the user has never set an `enabledStores.fomoplayer` value (the options page only writes `beatport` and `bandcamp`)
- **WHEN** `Root` filters `panels` to compute `enabledPanels`
- **THEN** the FomoPlayer panel MUST appear in `enabledPanels`, matching its visibility before this change.

