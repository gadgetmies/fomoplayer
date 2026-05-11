## Why

Opening the browser extension popup logs a React warning:

```
Warning: Each child in a list should have a unique "key" prop.

Check the render method of `Root`. See https://reactjs.org/link/warning-keys
    at BandcampPanel (...)
    at Root (...)
```

`packages/browser-extension/src/js/popup/Root.jsx:123-125` maps over
`components` and calls `React.createElement(component.component, …)`
without a `key`. React's reconciler then can't track list entries by
identity across renders and falls back to index-based matching. In
practice that means a panel re-mounts when `enabledPanels` reorders —
e.g. when the active host changes and `current` shifts from one panel
to another — and any local state on the previously-mounted panel
(e.g. a half-typed cart name in a dropdown) is lost.

Cosmetic in steady state, a real footgun on hover / navigation
transitions, and contributes to console noise that masks more serious
warnings.

## What Changes

- In `packages/browser-extension/src/js/popup/Root.jsx`, pass a stable
  `key` to the `React.createElement` call inside the panel `.map(...)`
  at lines 123-125. The natural identifier is the panel's store name,
  with an explicit fallback for the `MultiStorePlayerPanel` entry —
  which has no `storeName` because it represents the FomoPlayer app
  itself, not a store.
- Settle on a single source of identity for panels. Either (a) give
  the FomoPlayer panel a `storeName: 'fomoplayer'` and key off
  `component.storeName`, or (b) introduce an explicit `key` field on
  each panel definition. The design picks one; this proposal commits
  only to having a stable per-panel React key.
- Audit the rest of the popup tree (`packages/browser-extension/src/js/popup/*.jsx`)
  for other `.map(...)` sites that emit list children without keys.
  At the time of writing, the only `.map` in the tree is the one in
  `Root.jsx`, but the audit is part of acceptance so we don't regress
  on a sibling.

## Capabilities

### New Capabilities

- `extension-popup-panels`: the popup's per-host panel list — how
  panels are filtered, ordered, and rendered. The first requirement
  this capability documents is that the panel list renders with
  stable React keys so panels keep their local state across reorders.

### Modified Capabilities

None.

## Impact

- **Code**: `packages/browser-extension/src/js/popup/Root.jsx` — one
  `key` added to the `.map` body, plus whichever supporting field the
  design picks (a `storeName` on the FomoPlayer panel entry, or a new
  `key` field on panel definitions). ~5 lines, no new files.
- **Tests**: no new automated tests. The acceptance check is manual:
  open the popup, confirm no `key` warning, and confirm panel local
  state survives an `enabledPanels` reorder. Adding browser-level UI
  tests for this is out of scope (tracked separately under
  `wc-189-implement-unit-tests` / `m-208-implement-ui-tests`).
- **APIs**: none.
- **Risk**: minimal. The change is local to one render call; the
  filtering and ordering logic at `Root.jsx:102-109` is untouched.
