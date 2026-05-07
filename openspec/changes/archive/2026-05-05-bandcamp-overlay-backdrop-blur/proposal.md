## Why

The `[data-fp-injected]` wrap behind the Play / Queue / Add-to-Fomo
button trio on every Bandcamp surface uses a flat
`rgba(0, 0, 0, 0.55)` rounded backdrop. It reads cleanly on dark
cover art but feels heavy on light surfaces — a hard grey rectangle
sitting on a bright tile or a light feed entry.

Adding `backdrop-filter: blur(...)` carries through the underlying
colour so the backdrop softens to match its surroundings, while
keeping the buttons legible on dark cover art. It's a small, low-risk
visual polish that meaningfully improves how the overlay reads
across the variety of Bandcamp's lighter surfaces.

## What Changes

- Add `backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);`
  to the `[data-fp-injected]` wrap's inline style alongside the
  existing dark backdrop.
- Drop the backdrop's opacity from `0.55` to `0.45` so the blur
  isn't fighting an opaque wash; legibility on dark cover art
  remains within the bar item 016 set.
- Browsers without `backdrop-filter` support fall back to the dark
  wash alone — the unprefixed declaration is ignored, the opacity
  reduction is the only visible difference.
- Update the `bandcamp-track-actions` spec's "wrap carries a
  legibility backdrop" requirement to mention the blur and the
  reduced opacity, so future styling work doesn't undo it without
  intent.

## Capabilities

### Modified Capabilities

- `bandcamp-track-actions`: the legibility-backdrop requirement is
  refined to call out the backdrop blur and the reduced opacity.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/inject.js` —
  one inline-style update on the `buttonContainer()` helper.
- No JavaScript or build changes; no new dependencies; no manifest
  changes.
