# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-04_ — Scope deliberately narrow: cover-overlay buttons only.
  Release-page and per-track buttons stay as-is.
- _2026-05-04_ — Rename "Add to Fomo Player" → "Fomo" on overlays only.
  Cart icon retained for affordance.

## Rejected approaches

- _(none yet)_

## Open threads

- Coordinate with item 013 (broader colour-scheme rollout) — overlapping
  palette work. If 013 lands first, this item picks up its tokens. If this
  one ships first, 013 inherits the same hex values.
- Watch the cart-button.js shadow `STYLE` block — it is currently shared
  across all four call sites (release title, per-track release row,
  per-track-page header, discography overlay). Need to either pass a style
  variant or move overlay-only rules out of the shadow.

## Session log

- _2026-05-04_ — Item filed in response to feedback that the overlay
  buttons crowd the cover art and the long label is hard to read.
