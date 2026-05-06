## Why

The Fomo Player button trio (Play, Queue, Add-to-Fomo) currently
uses a transparent body with a brand-magenta border in its idle
state. Without the dark wash backdrop (removed by the previous
drop-shadow-only change), the brand border is the only thing
defining the buttons against the page — which reads as ungrounded
and out of place next to Bandcamp's own controls.

Bandcamp's own play button uses a solid `rgba(0, 0, 0, 0.75)` fill
with white text, square-ish corners (~2px radius), and no visible
border. Mirroring that style for the Fomo Player buttons makes the
trio read as belonging on Bandcamp pages while keeping the brand
identity exactly where it should be: on the hover state, where the
buttons fill with Fomo magenta to indicate they are *our*
interactive controls.

## What Changes

- Update the idle button style for both `cueButton` (Play / Queue)
  and `renderCartButton`'s toggle (Add-to-Fomo) to use:
  - `background: rgba(0, 0, 0, 0.75)`
  - `color: #fff`
  - `border-radius: 2px`
  - `border: 1px solid transparent` (preserving the layout box but
    not painting a magenta outline)
- Hover keeps the existing brand-magenta fill — the only way the
  brand colour appears in the trio at rest is on hover, exactly as
  before.
- Error state continues to flash distinct (magenta border drops to
  `#c63`, but the dark fill is kept so the error reads against
  every Bandcamp surface).
- Loading state inherits the new dark fill — the spinner already
  paints in `#fff`, so no spinner colour change is needed.
- Update the `bandcamp-track-actions` spec's "unified palette"
  requirement to describe the dark fill with hover-magenta rather
  than transparent fill with magenta border.

## Capabilities

### Modified Capabilities

- `bandcamp-track-actions`: the unified-palette requirement is
  refined to specify the dark fill, square corners, and
  hover-magenta combination.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/inject.js` —
  `cueButton`'s shadow-DOM `<style>` block.
- `packages/browser-extension/src/js/content/bandcamp/cart-button.js`
  — `renderCartButton`'s `STYLE` constant.
- No JavaScript changes; no new dependencies; no manifest impact.
- The wrap's drop-shadow stays in place — the buttons now have
  enough contrast on their own that the shadow becomes a depth cue
  rather than a legibility crutch.
