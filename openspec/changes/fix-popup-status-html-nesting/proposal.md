## Why

Triggering Bandcamp Feed sync from the extension popup mounts the
`Status` component, which logs a React `validateDOMNesting` warning:

```
Warning: validateDOMNesting(...): <h2> cannot appear as a descendant of <p>.
    at h2
    at p
    at Status (chrome-extension://…/popup.bundle.js)
    at Root (chrome-extension://…/popup.bundle.js)
```

`packages/browser-extension/src/js/popup/Status.jsx:11-22` wraps an
`<h2>`, a message line, a `<br />`, and a `<Progress>` element inside
a `<p>`. The HTML parser auto-closes the `<p>` on encountering the
`<h2>`, so the rendered DOM is `<p></p><h2>Processing</h2>…<Progress />`
rather than the JSX tree. Two consequences:

1. The browser inserts an empty `<p>` followed by the heading, which
   adds unintended margin / line-height between Status and the panels
   above.
2. The warning spams the console every time `Status` mounts — i.e.
   on every Bandcamp Feed sync click — masking more serious warnings.

## What Changes

- In `packages/browser-extension/src/js/popup/Status.jsx`, replace the
  `<p>` wrapper with a `<div>` so the rendered DOM matches the JSX
  tree and the markup is valid (block-level children inside a block
  container).
- Drop the `<br />` between the message text and the `<Progress>` if
  its only purpose was to compensate for the auto-closed-`<p>`
  whitespace. The `<Progress>` carries its own `margin: '0.5rem 0'`
  so the visual spacing is preserved without an explicit line break.

## Capabilities

### New Capabilities

- `extension-popup-status`: the popup's transient status indicator
  shown while a long-running background operation (e.g. Bandcamp Feed
  sync) is in progress. The first requirement this capability
  documents is that the indicator's markup is valid — no block
  elements nested inside `<p>` — so React does not emit
  `validateDOMNesting` warnings and the rendered DOM matches the JSX.

### Modified Capabilities

None.

## Impact

- **Code**: `packages/browser-extension/src/js/popup/Status.jsx` —
  swap one wrapper element, optionally remove one `<br />`. ~2 lines
  changed, no new files.
- **Tests**: no new automated tests. The acceptance check is manual:
  trigger a Bandcamp Feed sync from the popup, confirm no
  `validateDOMNesting` warning, confirm Status still renders the
  heading, message, and progress bar with no layout shift. Adding
  browser-level UI tests for this is out of scope (tracked separately
  under `m-208-implement-ui-tests`).
- **APIs**: none.
- **Risk**: minimal. Local change to one component's wrapper element;
  no behavioural code paths touched.
