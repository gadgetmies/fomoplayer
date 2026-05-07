## Context

The `[data-fp-injected]` wrap has gone through three iterations of
backdrop treatment in the recent backlog work:

1. Item 016 — flat dark wash, `rgba(0, 0, 0, 0.55)`, hard rectangle
   edge.
2. `bandcamp-overlay-backdrop-blur` — wash dropped to 0.45, added
   `backdrop-filter: blur(6px)` (which blurred the page content
   beneath the overlay, not the overlay's edges).
3. `bandcamp-overlay-edge-feather` — replaced `backdrop-filter`
   with `box-shadow: 0 0 8px 2px rgba(0, 0, 0, 0.45)` to feather
   the edge while keeping the wash.

The wash itself — even feathered — still paints a visible rectangle
on light Bandcamp surfaces. The user's actual intent is to remove
the wash entirely and rely solely on a soft drop shadow behind the
button container.

## Goals / Non-Goals

**Goals:**

- Remove the dark wash so no visible rectangle sits on top of the
  page.
- Provide a single soft drop shadow behind the wrap to anchor the
  buttons visually.
- Keep the buttons' existing brand border / hover / disabled states
  unchanged — they already define their own outlines.

**Non-Goals:**

- Repainting the buttons themselves.
- Adding a `filter: drop-shadow` per-button shape (which would
  shadow the buttons' silhouettes individually). The brief says
  "drop shadow behind the button container" — singular shadow on
  the container.
- Reintroducing a wash, even at lower opacity.

## Decisions

**Use `box-shadow: 0 2px 12px 4px rgba(0, 0, 0, 0.45)`.** The 2px
y-offset gives a subtle "drops down" feel; the 12px blur radius
makes the edge soft enough to not read as a halo; the 4px spread
extends the shadow's silhouette outward so it actually surrounds
the buttons rather than sitting only directly behind them.

**Drop the `background` declaration entirely.** Without a body, the
wrap's interior is transparent — the page chrome shows through
where the buttons are. The shadow paints behind the box's
silhouette (not inside it), so the legibility help is *around* the
buttons, not under them.

**Keep `border-radius: 6px`.** It's no longer painting a visible
shape, but it shapes the box-shadow's silhouette so the shadow is
softly rounded rather than starting from a hard rectangle.

## Risks / Trade-offs

- **Risk: buttons lose contrast on very-light surfaces because no
  wash darkens what's behind them** → Mitigation: the brand-coloured
  border (`1px solid colors.brandPrimary`) is still doing its job;
  the buttons read as outlined chips. The drop shadow adds depth
  cue without darkening the page directly under the button text.
  If a future report shows specific surfaces where this fails, we
  can either bump shadow opacity or add a per-button `filter:
  drop-shadow` — separate item.
- **Trade-off: this is the third iteration on the same wrap in two
  days.** Each iteration lands as its own openspec change so the
  spec history shows the design conversation, but it's worth
  collapsing the requirement once the visual settles.

## Migration Plan

No data or runtime migration. CSS-only update; ships with the next
extension build.

## Open Questions

- Is the 4px spread too large on the compact `#new-releases-vm`
  tiles where horizontal space is tight? Eyeball during
  verification; if it feels heavy, bump down to 2px.
