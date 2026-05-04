---
id: 018
title: Vertically align Queue and "Add to Fomo Player" buttons on Bandcamp
status: done
priority: P2
effort: S
created: 2026-05-04
depends-on: []
---

# Vertically align Queue and "Add to Fomo Player" buttons on Bandcamp

## Why

The injected Queue button (and Play, where present) sits a pixel or two
*below* the cart-dropdown button on the same row. The two share a flex
container with `align-items: center`, so the offset is most likely
caused by intrinsic differences in the shadow-DOM hosts (line-height /
baseline / vertical padding, or the icon-vs-text content of the cart
button changing the host's baseline). It looks slightly broken on every
release page.

## What

- Make the Queue / Play / cart-dropdown buttons sit on the same vertical
  centre line inside the shared `[data-fp-injected]` wrap, on the
  release-title section, on per-track rows, and on discography overlays.

## Acceptance criteria

- [ ] On a multi-track release page, Queue + Play + Add to Fomo Player
      buttons in a track row's `[data-fp-injected]` wrap are vertically
      centred to within 1px.
- [ ] On the release-title `[data-fp-injected]` wrap, "Queue
      track/release" and "Add … to Fomo Player" align the same way.
- [ ] Discography-overlay (`#music-grid` items) Queue + Add buttons
      align the same way.
- [ ] No regression in horizontal spacing or hit-targets.

## Code pointers

- `packages/browser-extension/src/js/content/bandcamp/inject.js` —
  `cueButton` (shadow DOM, button has 1px solid border, padding 2px 8px)
  and `buttonContainer` (the flex wrap with `align-items: center`).
- `packages/browser-extension/src/js/content/bandcamp/cart-button.js` —
  `button.toggle` styling (also 1px border, padding 2px 8px, but contains
  an SVG icon + text inside the same button). Likely culprit: the SVG's
  `vertical-align` baseline shifts the cart button by a pixel.

## Out of scope

- Restyling colours / size — see item 016.
- Replacing the cart icon entirely.

## Open questions

- Is the offset caused by the SVG (cart icon) inline baseline, or by the
  button's `display: inline-flex` vs `inline-block` interplay between the
  two shadow hosts? Spot-check by removing the cart icon temporarily.
