## Context

The embedded player's progress bar is rendered as `.bar` inside
`packages/browser-extension/src/js/content/bandcamp/player-ui.js`:

```css
.bar { flex: 1; height: 4px; background: #2c2c2c; border-radius: 2px;
       cursor: pointer; position: relative; }
.bar-fill { position: absolute; top: 0; left: 0; bottom: 0;
            background: brandPrimary; border-radius: 2px; }
```

Click handling uses `bar.getBoundingClientRect()` so the seek-ratio
math scales with whatever vertical extent the element has. The
visible 4px stripe is the only thing painted; the surrounding row
(`.progress`) uses flex with `align-items: center`.

## Goals / Non-Goals

**Goals:**

- Larger click hit area for the seek bar.
- Zero visible change to the painted stripe.
- No layout shift for the time-label spans on either side.

**Non-Goals:**

- Adding scrub / drag-to-seek support.
- Replacing the visual bar with a waveform or any other element.
- Touching the frontend `Preview.js` waveform-based seeker — that
  surface already has a generous hit area via the waveform image.

## Decisions

**Make `.bar` itself ~16px tall and use a `::before` pseudo for the
visible 4px stripe.** Keeping `.bar` as the click target preserves
the existing `bar.getBoundingClientRect()` math — the seek ratio
divides by `rect.width`, which is independent of height. Painting
the visible stripe via `::before` keeps the visual result identical
while letting the box itself be a comfortable target.

**Centre `.bar-fill` vertically using `top: 50%` /
`transform: translateY(-50%)`.** The fill needs to sit on top of the
visible stripe regardless of `.bar`'s now-larger height. Using
absolute centring avoids re-anchoring on flex parents.

**Do not alter `.progress`'s `align-items: center` parent.** With
`.bar` as a 16px-tall flex child centred in the row, the
neighbouring time labels stay where they are — they already centre
on the row's baseline, not the bar's top edge.

## Risks / Trade-offs

- **Risk: the larger hitbox overlaps neighbouring spans on narrow
  popup widths** → Mitigation: `.progress` already gives the bar
  `flex: 1` between two fixed-width spans, so the bar simply
  occupies the leftover horizontal space; the height change is
  vertical only and doesn't bleed into the spans' columns.
- **Risk: the `::before` pseudo introduces a stacking-context
  surprise that hides the brand-coloured `.bar-fill`** → Mitigation:
  `.bar-fill` already uses `position: absolute`. We give the
  `::before` no `z-index` and use the natural paint order: the
  pseudo paints first (the dark stripe), then `.bar-fill` (the brand
  fill on top). Both pin to `top: 50%; transform: translateY(-50%)`.

## Migration Plan

No data or runtime migration. Pure CSS update; ships with the next
extension build.

## Open Questions

- Should the hit area be 12px, 16px, or 20px? 16px is the standard
  iOS / Material guideline minimum tap-target heuristic; bigger
  starts to feel like wasted vertical space in a 56px-tall player.
  Default to 16px.
