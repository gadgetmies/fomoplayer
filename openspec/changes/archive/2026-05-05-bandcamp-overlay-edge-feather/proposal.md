## Why

The previous change (`bandcamp-overlay-backdrop-blur`) added a
`backdrop-filter: blur(6px)` to the `[data-fp-injected]` wrap. That
blurs the *page content behind* the overlay, which is the wrong
surface to soften — the user's intent was to soften the **edges of
the overlay itself** so the dark wash dissolves into the page rather
than ending in a hard rectangle. The current implementation made the
overlay heavier on light surfaces (the page beneath turns into a
smeared blur) instead of lighter.

This change replaces the `backdrop-filter` approach with a feathered
edge — a soft outer halo around the wrap so its boundary fades into
the page colour. The page content behind stays crisp; only the
overlay's perimeter is softened.

## What Changes

- Remove `backdrop-filter: blur(6px)` and `-webkit-backdrop-filter:
  blur(6px)` from the `[data-fp-injected]` wrap's inline style.
- Add a `box-shadow: 0 0 8px 2px rgba(0, 0, 0, 0.45)` declaration
  that bleeds the dark wash outward as a soft halo, feathering the
  wrap's edge so it dissolves into the page rather than ending in a
  hard rectangle.
- Keep the wash at `rgba(0, 0, 0, 0.45)` and the rounded corners at
  `border-radius: 6px`. The legibility wash itself is unchanged;
  only how its boundary blends with the page is.
- Update the `bandcamp-track-actions` spec's
  "legibility backdrop" requirement to describe the feathered edge
  rather than the backdrop-content blur.

## Capabilities

### Modified Capabilities

- `bandcamp-track-actions`: the legibility-backdrop requirement is
  refined to specify a feathered outer edge (box-shadow halo) and
  drops the backdrop-filter language.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/inject.js` —
  one inline-style update on the `buttonContainer()` helper.
- No JavaScript or build changes; no new dependencies; no manifest
  impact.
