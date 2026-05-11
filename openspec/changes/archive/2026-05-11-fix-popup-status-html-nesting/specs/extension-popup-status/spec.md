## ADDED Requirements

### Requirement: Status indicator markup SHALL be valid HTML

The popup `Status` component (`packages/browser-extension/src/js/popup/Status.jsx`) SHALL render its children (heading, message text, progress bar) inside a block-level container that accepts block-level descendants. The wrapper element MUST NOT be a `<p>` (or any other phrasing-content-only element), so the HTML parser does not auto-close it on encountering the inner `<h2>` and React does not emit a `validateDOMNesting` warning.

#### Scenario: Mounting Status produces no validateDOMNesting warning

- **GIVEN** the extension popup is open and a long-running background
  operation (e.g. Bandcamp Feed sync) is in progress, causing `Root` to
  render `<Status>`
- **WHEN** the user inspects the browser console
- **THEN** the console MUST NOT contain any `validateDOMNesting`
  warning attributable to `Status` — specifically no warning of the
  form `<h2> cannot appear as a descendant of <p>`.

#### Scenario: Rendered DOM matches the JSX tree

- **WHEN** a maintainer inspects the rendered DOM of a mounted
  `Status` component in DevTools
- **THEN** the heading, message text, and progress bar MUST appear as
  children of a single wrapper element (in that order), matching the
  JSX structure — not as siblings of an empty preceding `<p>` produced
  by the parser auto-closing a misused wrapper.

### Requirement: Status indicator visual layout SHALL be preserved

Replacing the `Status` wrapper element MUST NOT change the visible layout of the indicator: the heading, message line, and progress bar MUST occupy the same vertical positions and carry the same vertical spacing they did before the fix, so users perceive no shift when the indicator mounts.

#### Scenario: No visual regression on Bandcamp Feed sync

- **GIVEN** the user triggers a Bandcamp Feed sync from the popup
- **WHEN** `Status` mounts and renders the heading "Processing", the
  status message, and the progress bar
- **THEN** the three elements MUST render at the same vertical rhythm
  they did prior to this change — no missing line breaks, no doubled
  whitespace, no layout shift relative to the panels above.
