---
id: 016
title: Restyle the cover-image overlay buttons (shorter label, FP colours, readable background)
status: todo
priority: P2
effort: S
created: 2026-05-04
depends-on: []
---

# Restyle the cover-image overlay buttons (shorter label, FP colours, readable background)

## Why

On Bandcamp discography pages the extension injects a Queue + Add-to-Fomo-Player
button pair on top of each release cover image (top-right corner). Two issues
hurt readability:

1. The label "Add to Fomo Player" is too long for the constrained overlay
   real estate — it crowds the cover and frequently wraps or visually clips.
2. The buttons inherit the shadow-DOM neutral palette (transparent background
   with the Bandcamp-blue border `#0687f5`), which clashes with Fomo Player's
   own brand colours and offers little contrast against bright or busy cover
   art behind them.

## What

- Shorten the cart button label on cover overlays from "Add to Fomo Player"
  to **"Fomo"**, keeping the cart icon. The Queue button keeps its current
  "Queue" label (already short).
- Switch the cover-overlay buttons to the **Fomo Player site colour scheme**.
  See item 013 (broader colour-scheme rollout) for the canonical palette;
  this item adopts the same palette specifically for the cover-overlay
  context.
- Add a **semi-transparent dark backdrop** behind the button row so the
  button text and icon stay legible on top of any cover art (light, dark,
  busy, or low-contrast).

## Acceptance criteria

- [ ] On a Bandcamp discography page, each cover's overlay shows a Queue
      button and a cart-icon + "Fomo" button (no "Add to Fomo Player" text).
- [ ] The button colours match the Fomo Player site palette (border / fill /
      hover state).
- [ ] The button row has a semi-transparent dark background or padding
      "pill" so the text remains readable against any cover art.
- [ ] The release-page (title-section) and per-track-row cart buttons are
      **unchanged** — only the discography cover overlay is restyled.

## Code pointers

- `packages/browser-extension/src/js/content/bandcamp/inject.js` —
  `injectDiscographyButtons` is the only call site that overlays cover
  images. Pass a shorter `label` to `renderCartButton` here.
- `packages/browser-extension/src/js/content/bandcamp/cart-button.js` —
  shadow-DOM `STYLE` block is currently shared across all cart buttons.
  Either parameterise the styles for the overlay variant, or move the
  overlay-specific styling onto the wrap (light DOM) so the shadow stays
  generic.
- `packages/front/src/` (or `packages/front/src/styles/`) — the canonical
  Fomo Player colour palette lives here; pull values rather than re-typing
  hex codes.

## Out of scope

- Restyling the release-page cart button or the per-track-row buttons
  (those have ample room for the longer label).
- Changing button positioning on the cover (top-right corner stays).
- The broader colour-scheme rollout to the embedded player and all
  injected controls — that's item 013.

## Open questions

- Backdrop strategy: a single semi-transparent rounded rectangle behind the
  whole button row, or per-button pill backgrounds? Per-button is simpler
  but heavier visually.
- Where to source the canonical palette: a CSS module export, runtime config
  injection, or a copy-paste of hex values? Preferred: the same source item
  013 will use.
