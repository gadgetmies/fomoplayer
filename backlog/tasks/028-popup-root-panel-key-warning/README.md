---
id: 028
title: Popup Root warns "Each child in a list should have a unique 'key' prop"
effort: S
created: 2026-05-06
---

# Popup Root warns "Each child in a list should have a unique 'key' prop"

## Why

Opening the extension popup logs:

```
Warning: Each child in a list should have a unique "key" prop.

Check the render method of `Root`. See https://reactjs.org/link/warning-keys
    at BandcampPanel (...)
    at Root (...)
```

`Root.jsx:123-125` maps over `components` and calls
`React.createElement(component.component, { isCurrent, ...panelProps })`
without a `key` prop. React's reconciler then can't map list
entries across renders by identity — it falls back to index-based
matching. In practice that means a panel re-mount when
`enabledPanels` reorders (e.g. when the active host changes), which
costs state on whatever panel was previously mounted in that slot
(e.g. a half-typed cart name in the dropdown is lost).

Cosmetic in steady state, real footgun on hover / navigation
transitions, and contributes to console noise that masks more
serious warnings.

## What

- Pass `key` to `React.createElement` in `Root.jsx:123-125`. The
  natural identifier is `component.storeName` (already unique
  across the panels list — used elsewhere as the lookup key in
  `enabledStores`).
- Confirm no other `.map(...)` site in the popup tree drops the
  warning at the same time — if there's another, fix it in the
  same change.

## Acceptance criteria

- [ ] Opening the popup produces no `key` prop warnings in the
      console.
- [ ] Hovering between panels (or any transition that reorders
      `enabledPanels`) preserves the matching panel's local state
      rather than re-mounting it.
- [ ] No other regression — existing panel rendering, ordering,
      and `current` detection behave the same.

## Code pointers

- `packages/browser-extension/src/js/popup/Root.jsx:123-125` —
  the offending `components.map(...)` call.
- `panel.storeName` field on each panel definition (used as the
  lookup key in `state.enabledStores`).

## Out of scope

- Refactoring `Root` to functional components or hooks.
- Changing the panel ordering logic.

## Open questions

- Is `storeName` guaranteed unique and stable across all panel
  definitions? Skim `panels` initialisation in `Root.jsx` (or
  wherever the panels list is built) to confirm before relying on
  it.
