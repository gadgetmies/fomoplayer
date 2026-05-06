## Context

The wrap's box-shadow was the last bit of decoration left after
the wash was removed. With the new Bandcamp-style button fill (the
just-shipped `bandcamp-buttons-bandcamp-style` change), each button
is opaque and self-contained — the shadow on the wrap is no longer
contributing anything the buttons aren't already doing.

## Goals / Non-Goals

**Goals:** wrap paints nothing; the buttons are the visual.

**Non-Goals:** changing the buttons themselves, or the per-button
borders, hover states, or layout.

## Decisions

**Strip the `box-shadow` declaration from the inline `cssText`.**
The wrap keeps its flex / padding / `border-radius` declarations
because they affect layout and the (transparent) clipping
silhouette. Painting goes to zero.

## Risks / Trade-offs

- **Risk: trio loses depth on busy backgrounds without the
  shadow** → Each button has its own opaque dark fill, which
  provides the depth cue. The shadow was redundant.

## Migration Plan

CSS-only update; ships with the next extension build.

## Open Questions

- None.
