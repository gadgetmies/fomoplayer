## Context

Both `cueButton` (in `inject.js`) and the cart toggle (in
`cart-button.js`) bake their palette into the inline shadow-DOM
styles. Today the same shadow rules render on every Bandcamp surface,
so changing a colour for the cover overlay would change it for every
surface unless the factories accept a per-mount variant.

The Fomo Player primary palette (from `packages/front/src/buttons.css`)
is `background: #b40089; border: 1px solid #530059; color: #fff;
hover: #9f0076`. The button-push_button :before band is a Fomo Player
visual touch but probably reads as overkill on tiny overlay buttons —
we'll skip the inset bottom band for now.

The cover overlay has no backdrop today, which leaves the buttons
floating directly on top of cover art. A single rounded
semi-transparent dark pill behind the wrap is enough to give the row
contrast without dominating the cover.

## Goals / Non-Goals

**Goals:**
- Cover-overlay cart label reads "Fomo" with the cart icon.
- Cover-overlay button trio uses the Fomo Player magenta palette.
- Cover-overlay wrap has a semi-transparent dark backdrop that gives
  the buttons readable contrast on any cover art.
- Release-page (title section), per-track-row, and feed-page buttons
  stay on the existing Bandcamp-blue palette and original labels.

**Non-Goals:**
- Roll the magenta palette to non-overlay surfaces (item 013).
- Add a backdrop to non-overlay surfaces.
- Replace the cart icon SVG.

## Decisions

### Add a `variant` argument to both button factories

Both `cueButton` and `renderCartButton` accept an optional
`variant: 'default' | 'overlay'` argument. Default keeps current
Bandcamp-blue styles. Overlay swaps the palette to Fomo Player
magenta. The variant is used as a CSS attribute selector inside the
shadow root (`button[data-variant="overlay"]` and
`button.toggle[data-variant="overlay"]`), so each shadow root carries
both palettes and picks one at runtime — no two builds, no inline
style merging required.

**Alternative considered:** Two separate factories (`overlayCueButton`
and `overlayCartButton`). Rejected — duplicates the entire shadow
markup just to swap colours, and would diverge over time.

### Backdrop is a single rounded pill on the wrap, not per-button

Per-button pill backdrops would clutter the row and double the visual
weight of the button itself (each button already has a magenta fill).
A single rounded pill behind the whole wrap (semi-transparent
`rgba(0, 0, 0, 0.55)`, `border-radius: 6px`, `padding: 4px 6px`) is
enough to lift the row off the cover art without competing with it.

**Alternative considered:** Solid dark backdrop. Rejected — fully
opaque hurts the cover image more than necessary.

### Mount the backdrop via inline style on the overlay wrap

The overlay wrap is created in `injectDiscographyButtons` (and the
feed injector). Adding a `background`, `border-radius`, and `padding`
to its inline `cssText` keeps the styling co-located with the mount
logic and avoids leaking into other surfaces — the wrap is created
fresh per-injection site.

## Risks / Trade-offs

- **Risk:** Some cover art is already very dark, in which case the
  semi-transparent dark backdrop adds little contrast. → Mitigation:
  the magenta button background carries enough self-contrast to stay
  legible on any background; the backdrop is belt-and-braces.
- **Risk:** The shorter "Fomo" label could be read as a brand
  impression rather than a verb. → Mitigation: the cart icon
  preceding the label keeps the cart-add semantics obvious; tooltip
  on the host can spell out "Add to Fomo Player" if needed.
- **Trade-off:** Hard-coding the palette as hex values inside the
  shadow CSS rather than threading them through a CSS-variables
  pipeline. Item 013 will roll the palette across surfaces and is
  the right place to introduce variables — for this item, a literal
  copy of the four hex values is enough.
