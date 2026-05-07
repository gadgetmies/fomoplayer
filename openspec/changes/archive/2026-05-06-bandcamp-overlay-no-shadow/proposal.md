## Why

The previous overlay iteration kept a soft drop shadow behind the
`[data-fp-injected]` wrap as a visual anchor. With the buttons now
styled like Bandcamp's own play button (opaque dark fill, white
text, small radius), the buttons provide their own grounding —
the wrap shadow is redundant and reads as additional visual weight
the design doesn't need.

Drop the wrap's `box-shadow` entirely. The wrap becomes a pure
layout container with no painted decoration; the buttons are the
visual.

## What Changes

- Remove `box-shadow: 0 2px 12px 4px rgba(0, 0, 0, 0.45)` from the
  `[data-fp-injected]` wrap's inline `cssText`.
- The wrap retains its flex layout, padding, and `border-radius`
  declarations; nothing else painted.
- Update the `bandcamp-track-actions` spec's
  "legibility backdrop" requirement to forbid the shadow as well as
  the wash and `backdrop-filter` — the wrap MUST paint nothing.

## Capabilities

### Modified Capabilities

- `bandcamp-track-actions`: the legibility-backdrop requirement
  becomes "the wrap paints nothing — no wash, no shadow, no blur".

## Impact

- `packages/browser-extension/src/js/content/bandcamp/inject.js` —
  one inline-style update on the `buttonContainer()` helper.
- No JavaScript or build changes; no new dependencies; no manifest
  impact.
