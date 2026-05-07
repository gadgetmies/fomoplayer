---
id: 029
title: Popup Status component nests <h2> inside <p> — invalid HTML
effort: S
created: 2026-05-06
---

# Popup Status component nests `<h2>` inside `<p>` — invalid HTML

## Why

Triggering Bandcamp Feed sync from the popup logs:

```
Warning: validateDOMNesting(...): <h2> cannot appear as a descendant of <p>.
    at h2
    at p
    at Status (chrome-extension://…/popup.bundle.js:35245:5)
    at Root (chrome-extension://…/popup.bundle.js:35081:5)
```

`packages/browser-extension/src/js/popup/Status.jsx` wraps a
`<h2>` (and a `<Progress>` block) inside a `<p>`:

```jsx
<p>
  <h2>Processing</h2>
  {this.props.message}
  <br />
  <Progress … />
</p>
```

The HTML parsing model auto-closes the `<p>` on encountering `<h2>`,
so the rendered DOM is `<p></p><h2>Processing</h2>…<Progress />`
— different from the JSX. Two real consequences:

1. The browser inserts an empty `<p>` followed by the heading, which
   adds unintended margin / line-height between Status and the
   panels above.
2. The `<br />` and the `<Progress>` end up as siblings of `<h2>`
   *outside* any block-level wrapper, which can interact oddly with
   any future CSS that targets `Status > p`.

Plus the warning spams the console on every Feed sync click.

## What

- Replace the `<p>` wrapper in `Status.jsx` with a `<div>` (or a
  fragment with the children block-positioned), so the markup is
  valid and the rendered DOM matches the JSX.
- Optionally remove the `<br />` if it was only there to compensate
  for the auto-closed-`<p>` whitespace; verify the visual spacing
  with the Progress bar still reads cleanly.

## Acceptance criteria

- [ ] Triggering an operation that mounts `Status` produces no
      `validateDOMNesting` warnings.
- [ ] Status renders visually the same (heading "Processing", the
      message line, the progress bar) — no layout shift, no extra
      whitespace, no missing line breaks.

## Code pointers

- `packages/browser-extension/src/js/popup/Status.jsx:11-22` —
  the offending JSX.

## Out of scope

- Restyling the Status component's typography / colours.
- Restyling `Progress` itself.

## Open questions

- Is the `<br />` doing anything load-bearing? If the
  `<Progress>` block has `margin-top` already, the `<br />` is
  probably vestigial and can drop with the `<p>` rewrap.
