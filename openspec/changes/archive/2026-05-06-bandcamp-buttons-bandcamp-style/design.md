## Context

`cueButton` (in `inject.js`) renders the Play and Queue buttons;
`renderCartButton` (in `cart-button.js`) renders the Add-to-Fomo
cart toggle. Both currently use the same idle palette:

```css
background: transparent;
color: #fff;
border: 1px solid #b40089;  /* colors.brandPrimary */
border-radius: 3px;
```

with hover filling `#b40089`. The brand border was the only thing
giving the buttons a visible outline against the page; with the
just-removed dark wash, the buttons read as floating outlines,
which is jarring next to Bandcamp's own grounded play button.

Bandcamp's play button uses `rgba(0, 0, 0, 0.75)` fill, white
text, ~2px radius, and no border. Mirroring that grounds our trio
in Bandcamp's visual idiom while leaving the brand magenta to
distinguish them on hover.

## Goals / Non-Goals

**Goals:**

- Idle buttons use a dark fill with white text, 2px radius, no
  visible coloured border.
- Hover fill stays brand magenta.
- Layout box does not shift between idle and hover.

**Non-Goals:**

- Changing the buttons' padding, font size, gap, line-height, or
  icon sizing.
- Changing the spinner colour (already `#fff`).
- Touching the embedded sticky player UI's controls — those follow
  a separate visual contract.
- Changing the cart-dropdown popup styling. Only the toggle.

## Decisions

**`border: 1px solid transparent` instead of dropping the border
declaration.** Keeping a 1px transparent border preserves the
button's layout box at the same dimensions as before, so the
hover state can swap to a coloured border (we keep the magenta
fill on hover, no border change needed) without shifting
neighbouring controls. It's also a hedge against any future
hover variant that re-introduces a coloured outline.

**Drop the magenta border on idle entirely (don't keep it in any
form).** The dark fill alone provides the visual grounding; an
additional brand outline would be busy and competes with the
hover affordance.

**Keep the error state's magenta-border drop to `#c63`.** Error
flashing is a deliberate state change and the orange border / text
combination remains the most legible across page surfaces. Add a
dark fill consistent with idle so the orange reads against the
same background.

## Risks / Trade-offs

- **Risk: dark buttons disappear on dark Bandcamp surfaces (e.g.
  the cover-overlay background)** → Mitigation: the wrap's drop
  shadow already provides a soft halo around the trio, separating
  it from the page chrome. White text on `rgba(0, 0, 0, 0.75)` is
  also legible because the 75% black is dense enough to retain
  its identity even atop a near-black backdrop.
- **Risk: users miss the brand identity now that magenta is
  gone-at-rest** → Mitigation: hover still fills magenta, and the
  player UI elsewhere (popup, sticky player, embedded player play
  button) carries the brand at rest. The trio's job is to belong
  on Bandcamp pages first, brand them ours second.

## Migration Plan

No data or runtime migration. CSS-only update; ships with the next
extension build.

## Open Questions

- Should the error state also drop to `rgba(0, 0, 0, 0.75)` or
  keep its lighter / transparent fill so the orange border reads
  more sharply? Default to dark fill for consistency.
