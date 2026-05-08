---
id: 107
title: '"Scroll to current" button at the top of the tracks table is not centered'
effort: S
created: 2026-05-08
---

# "Scroll to current" button at the top of the tracks table is not centered

## Why

When the currently-playing track scrolls above the visible portion of
the tracks table, a floating "Scroll to current" pill button is meant
to appear pinned to the top of the table, horizontally centered, so
the user can jump back to the playing track. The button does appear,
but it is offset to the **left** of center rather than horizontally
centered as intended.

The visual result is a button that looks misaligned with the table
below it and is harder to spot than it should be.

## What

- Inspect the layout: the floating row at
  `packages/front/src/Tracks.js:944` is a `<tr>` styled with
  `position: 'fixed'`, `width: '100%'`. Its child `<td>` (lines
  945-953) has `width: '100%'`, `display: flex`,
  `justifyContent: 'center'`. In principle this should center the
  button inside the viewport-pinned row, but in practice the result
  is off-center to the left.
- Identify the actual root cause. A few likely candidates:
  1. The `<td>` is the only cell in a `<tr>` whose sibling rows have
     multiple columns — without `colSpan={N}`, the cell takes only
     the *first column's* width, so `justifyContent: 'center'`
     centers within column 1's narrow strip, not across the whole
     table.
  2. `position: fixed` on a `<tr>` is unusual; some browsers may not
     reflow the row to fill the viewport width as expected.
  3. The fixed row spans the **viewport** width while the table
     itself is narrower (e.g. there is a left navigation panel),
     making "center of viewport" land left-of-center relative to the
     table.
- Apply the smallest fix that makes the button center over the table
  (not over the viewport) and matches how the bottom-edge button at
  `Tracks.js:1008` is positioned.

## Acceptance criteria

- [ ] When the currently-playing track is above the visible viewport,
      the "Scroll to current" button is horizontally centered relative
      to the tracks table on both desktop and mobile.
- [ ] The button is centered when the table is narrower than the
      viewport (e.g. desktop with a left side panel) — i.e. the button
      tracks the *table's* center, not the *viewport's* center.
- [ ] No regression in the symmetric "below the screen" case at
      `Tracks.js:1008` (the button at the bottom edge of the table when
      the current track is below the viewport).
- [ ] The fix doesn't break the `position: fixed` behaviour that pins
      the row to the top of the table area while the user scrolls.

## Code pointers

- `packages/front/src/Tracks.js:641-649` — definition of the
  `scrollToCurrentButton` element. Reused at both the top and bottom
  edges.
- `packages/front/src/Tracks.js:944-954` — the top-edge floating row.
  This is the buggy site.
- `packages/front/src/Tracks.js:1000-1009` — the symmetric bottom-edge
  row. Uses a wrapping `<div>` with `position: 'absolute'` instead of
  putting `position: 'fixed'` on the `<tr>`. Compare both shapes; the
  bottom one may already be a known-good pattern to mirror.
- `packages/front/src/Tracks.js:790-833` — the table's main column
  header row, which establishes the actual column count if a
  `colSpan` fix is needed.

## Out of scope

- Restyling the button itself (size, colour, glow). It looks fine
  apart from the position.
- Changing when the button appears (the `currentAboveScreen` /
  `currentBelowScreen` state logic). That works correctly today.
- Mobile-specific layout changes beyond what's needed to centre this
  button.

## Open questions

- Is this bug specific to desktop with a left navigation panel, or
  does it also reproduce on mobile / on a desktop window with no side
  panel? Eyeballing the layout suggests the viewport-vs-table mismatch
  is the most likely cause, which would mean it's worse the wider the
  side panel.
- Does the bottom-edge button (`Tracks.js:1008`) center correctly
  today? If yes, mirror its shape; if no, both probably want the same
  fix.
