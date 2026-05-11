## 1. Audit the popup tree for unkeyed list children

- [x] 1.1 Grep `packages/browser-extension/src/js/popup/` for `.map(`
      and confirm the only list-of-children site is `Root.jsx:123-125`.
      If a sibling site exists, fold it into this change.

## 2. Apply the fix in Root.jsx

- [x] 2.1 In `packages/browser-extension/src/js/popup/Root.jsx`, add
      `storeName: 'fomoplayer'` to the `MultiStorePlayerPanel` entry
      in the `panels` array (around line 60).
- [x] 2.2 In the same file, change the `.map(...)` body at lines
      123-125 so the props object passed to `React.createElement`
      includes `key: component.storeName`. Leave the existing
      `isCurrent` and `...panelProps` props alone.
- [x] 2.3 Confirm the filter at `Root.jsx:102-105` still treats the
      FomoPlayer panel as enabled when `enabledStores.fomoplayer` is
      undefined — i.e. the rendered panel list is unchanged.

## 3. Manual verification (user-driven)

- [x] 3.1 Build the extension and load it locally.
- [x] 3.2 Open the popup on a non-store page and confirm the console
      has no `key` prop warning attributable to `Root`.
- [x] 3.3 Open the popup on a Bandcamp page, interact with a panel in
      a way that produces local state (e.g. start typing in the cart
      dropdown), navigate to a different host so the active panel
      shifts, then return — confirm the panel's local state survives
      the reorder.
- [x] 3.4 Confirm no panel that should be visible has disappeared and
      none that should be hidden has appeared.

## 4. Land the change

- [ ] 4.1 Commit the Root.jsx edit together with the OpenSpec change
      and the backlog status move (per project commit policy: one
      commit per task, all related files together).
- [ ] 4.2 Archive the OpenSpec change.
- [ ] 4.3 Move the backlog symlink from `in-progress/` to `done/`
      (drop the ordering prefix).
