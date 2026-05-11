## Context

`Status` is a small status-indicator component rendered by `Root.jsx`
while a background operation (e.g. Bandcamp Feed sync) is in flight.
It renders one heading, one short message line, and a `<Progress>`
bar. Today it wraps those three children in a `<p>` element, which
the HTML parser auto-closes the moment it encounters the inner
`<h2>` — producing an empty `<p></p>` followed by the rest as
siblings, rather than the JSX tree.

This is the kind of change that does not really need a design
document; it is included because the schema requires `design.md`
before `tasks.md` can be authored. The one decision worth recording
is the wrapper element choice.

## Goals / Non-Goals

**Goals:**

- Rendered DOM tree matches the JSX (no `validateDOMNesting`
  warning).
- Visual layout (heading, message line, progress bar) is unchanged.
- Local-only change inside `Status.jsx`.

**Non-Goals:**

- Redesigning `Status`'s typography, colours, or spacing.
- Restyling `Progress` itself.
- Adding automated tests for popup rendering (tracked separately
  under `m-208-implement-ui-tests`).
- Re-evaluating where `<Status>` is mounted in `Root.jsx`.

## Decisions

### Wrap children in a `<div>`, not a fragment or `<section>`

- **Decision**: replace the `<p>` wrapper with a `<div>`.
- **Rationale**: a `<div>` accepts block-level children (`<h2>`,
  `<Progress>` — which renders as a `<div>` itself), produces the
  same single-container DOM the existing CSS targets, and keeps the
  JSX shape one-for-one with the rendered DOM.
- **Alternatives considered**:
  - `<React.Fragment>` — valid markup-wise, but `Progress` is
    rendered inline among headings and text without an explicit
    block container, which makes any future `Status > *` CSS more
    fragile. A wrapping element is the cheaper default.
  - `<section>` — semantically tempting for "the operation status
    section", but `Status` is a transient progress indicator inside
    the popup, not a content section in the document outline.
    `<div>` is the lower-information, lower-commitment choice.

### Drop the `<br />`

- **Decision**: remove the `<br />` between the message text and the
  `<Progress>`.
- **Rationale**: `<Progress>` already carries `margin: '0.5rem 0'`
  (line 20), which provides the same vertical separation the
  `<br />` was producing. With the `<p>` wrapper gone the `<br />`
  is no longer compensating for any auto-closed-tag whitespace
  either.
- **Verification**: manual — open the popup mid-sync and confirm the
  three lines (heading, message, progress) sit at the same vertical
  rhythm they did before.

## Risks / Trade-offs

- **Visual regression** → mitigated by manual verification: trigger
  Bandcamp Feed sync from the popup before and after, eyeball the
  spacing of heading / message / progress.
- **Removing `<br />` changes spacing on a host I did not test** →
  mitigated by the fact that `Status` is host-agnostic; the same
  component renders identically regardless of which store panel is
  current. If the spacing reads off in review, restoring the
  `<br />` is a one-line follow-up.
