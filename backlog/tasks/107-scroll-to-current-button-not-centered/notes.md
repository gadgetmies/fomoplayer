# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-09-23_ — Root cause: the top-edge row was a `<tr>` with
  `position: fixed; width: 100%`. For a fixed element the percentage
  width resolves against the **viewport**, while its left edge stays at
  the tbody's static position, so the row (and the centred button)
  extended past the track list and its centre drifted off the table's
  centre (17px at 1280px wide in the browser test). Fixed by mirroring
  the bottom-edge row: a zero-height `position: sticky; top: 0` row
  whose cell wraps the button in an absolutely positioned div, so it is
  centred within the tbody and stays pinned while scrolling.

## Rejected approaches


## Open threads

- Things to come back to, partially-explored ideas, suspicious findings

## Session log

- _2026-05-08_ — Item created from a user observation. Reproducer:
  scroll the playing track above the visible viewport in the tracks
  table; the floating "Scroll to current" pill at the top edge is
  visibly left-of-center.
- _2026-09-23_ — Fixed in `packages/front/src/Tracks.js`; added demo
  pair `packages/back/test/browser/scroll-to-current-{local,preview}.js`
  with shared steps in `test/lib/scroll-to-current-steps.js`. The test
  fails on the old code (17px offset) and passes with the fix.
