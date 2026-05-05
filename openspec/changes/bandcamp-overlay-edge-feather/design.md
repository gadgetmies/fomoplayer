## Context

The previous change (`bandcamp-overlay-backdrop-blur`) misread the
intent of the user-facing brief. "Blur the edges of the overlay" was
interpreted as "blur the page content behind the overlay using
`backdrop-filter`", which softened the underlying page rather than
the overlay's boundary. The right reading is: feather the overlay's
*perimeter* so the dark wash dissolves into the page colour, leaving
the page content underneath crisp.

## Goals / Non-Goals

**Goals:**

- Soft, feathered edge on the `[data-fp-injected]` wrap's outer
  boundary.
- Page content underneath stays crisp (no `backdrop-filter`).
- Single change point in `buttonContainer()`.

**Non-Goals:**

- Blurring the buttons or their text.
- Per-surface variants of the feathered edge.
- Touching the embedded sticky player UI.

## Decisions

**Use `box-shadow: 0 0 8px 2px rgba(0, 0, 0, 0.45)`.** A box-shadow
with a non-zero blur radius and a small spread paints a soft halo
outside the rounded rectangle that fades to transparent. That
matches the "feathered edge" intent without requiring pseudo-elements
(which inline `cssText` cannot express) or a wrapping layer. The
shadow colour matches the wash colour so the halo reads as the same
dark layer dissolving outward.

**Drop `backdrop-filter`.** The previous declarations are removed —
they no longer match the requirement and were the source of the
"blurred page content" bug.

**Keep wash, padding, border-radius.** The legibility properties of
the overlay itself are unchanged.

## Risks / Trade-offs

- **Risk: the box-shadow halo bleeds onto neighbouring controls on
  tight surfaces (per-row `.time` siblings, compact tiles)** →
  Mitigation: the shadow is 8px blur + 2px spread = ~10px outer
  reach. The wrap already sits inside its own injected container
  with horizontal gaps; the small halo blends with the surrounding
  page colour and does not draw a hard line.
- **Risk: dark page chrome saturates the halo so the feather is not
  visible** → Mitigation: this is a feature, not a bug — on dark
  surfaces the overlay already blends naturally; the feather only
  needed to soften the contrast edge on light surfaces.
- **Trade-off: the halo extends the visual footprint by a few px on
  every side.** Acceptable; the wrap already had visual padding,
  and the halo is far softer than a bordered rectangle.

## Migration Plan

No data or runtime migration. Pure CSS update; ships with the next
extension build.

## Open Questions

- None — the previous change provides the calibration baseline; we
  inherit its 0.45 wash and 6px radius decisions.
