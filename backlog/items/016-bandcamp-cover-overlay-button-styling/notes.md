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
- _2026-05-05_ — Threaded a `variant: 'default' | 'overlay'` argument
  through both `cueButton` (in
  `packages/browser-extension/src/js/content/bandcamp/inject.js`) and
  `renderCartButton` (in `cart-button.js`). The shadow CSS in each
  factory now carries both palettes and switches via a
  `data-variant="overlay"` attribute selector, so call sites pick the
  palette without code duplication. The discography and feed
  injectors pass `variant: 'overlay'`, label `'Fomo'` for the cart
  toggle, and mount the wrap with a shared `OVERLAY_WRAP_CSS`
  constant adding `background: rgba(0,0,0,0.55); border-radius: 6px;
  padding: 4px 6px` to the existing absolute-positioning. Release-
  title and per-track-row sites keep the default variant. Resolves
  the open thread re: cart-button.js style sharing — the shadow
  scope now hosts both variants together.
