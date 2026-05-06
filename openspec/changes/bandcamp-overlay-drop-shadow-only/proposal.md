## Why

The previous iterations of the `[data-fp-injected]` wrap kept a
semi-transparent dark wash (`rgba(0, 0, 0, 0.45)`) behind the button
trio — first as a flat block, then with `backdrop-filter`, then
with a feathered `box-shadow`. Each variant kept the wash itself,
which meant the rectangle's edge — even feathered — read as a hard
shape on light Bandcamp surfaces.

The user's intent is simpler: drop the dark wash entirely and place
**only** a soft drop shadow behind the button container. That gives
the trio a subtle visual anchor without painting any visible
rectangle on top of the page. Buttons rely on their existing brand
border for definition; the shadow provides depth.

## What Changes

- Remove `background: rgba(0, 0, 0, 0.45)` from the
  `[data-fp-injected]` wrap. The wrap's body becomes transparent.
- Replace the previous `box-shadow: 0 0 8px 2px rgba(0, 0, 0, 0.45)`
  edge-feather with a softer drop shadow:
  `box-shadow: 0 2px 12px 4px rgba(0, 0, 0, 0.45)`. The 2px y-offset
  + 12px blur + 4px spread produces a diffuse soft-edged shadow
  beneath and around the container, with no visible rectangle in
  the foreground.
- Keep `border-radius: 6px` so the shadow's silhouette is gently
  rounded.
- Update the `bandcamp-track-actions` spec's
  "legibility backdrop" requirement to describe the drop-shadow-only
  treatment rather than the dark wash + halo combination.

## Capabilities

### Modified Capabilities

- `bandcamp-track-actions`: the legibility-backdrop requirement
  changes from "semi-transparent dark wash + feathered edge" to
  "soft drop shadow only, no visible body".

## Impact

- `packages/browser-extension/src/js/content/bandcamp/inject.js` —
  one inline-style update on the `buttonContainer()` helper.
- No JavaScript or build changes; no new dependencies; no manifest
  impact.
- Buttons on very-light Bandcamp surfaces lose the dark-wash
  legibility crutch they had before. The brand-coloured border
  (`1px solid colors.brandPrimary`) is what defines them now; the
  drop shadow adds depth but does not darken the area underneath
  the buttons.
