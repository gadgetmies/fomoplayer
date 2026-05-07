## Context

`packages/browser-extension/src/js/content/bandcamp/inject.js`'s
`buttonContainer()` helper sets an inline-style backdrop on every
`[data-fp-injected]` wrap:

```
display: inline-flex; gap: 6px; align-items: center; vertical-align: middle;
background: rgba(0, 0, 0, 0.55); border-radius: 6px; padding: 4px 6px;
```

The wrap appears on the release page title section, per-track rows
(after the `.time` span), discography tile overlays, feed entries
(`#stories` cards and `#new-releases-vm` compact tiles), and the
cover-overlay control row. The 0.55 wash was set in item 016 to keep
the white-on-transparent buttons readable; it does that, but it
reads as a hard grey block on light surfaces.

## Goals / Non-Goals

**Goals:**

- Soften the backdrop on light surfaces so it tracks the underlying
  colour rather than slamming a flat dark rectangle on top.
- Keep buttons legible on dark cover art.
- Single point of change — `buttonContainer()` already centralises
  the backdrop.

**Non-Goals:**

- Per-surface backdrop variants. The wrap is shared and stays so.
- Re-skinning the buttons inside the wrap (item 016 territory).
- Adding a config knob to toggle the blur. No knobs.

## Decisions

**Use `backdrop-filter: blur(6px)` + `-webkit-backdrop-filter:
blur(6px)`.** Both prefixes together cover Chrome, Firefox (which
ships unprefixed support), and Safari (which ships the prefix). No
build-time autoprefixer needed.

**Drop opacity from 0.55 → 0.45.** The blur compensates for some of
the wash, so a slightly lighter overlay reads better on every
surface tested in item 016. Legibility on dark cover art remains
within the bar item 016 set.

**Browsers without `backdrop-filter` support fall back to the wash.**
The unprefixed declaration is silently ignored; the prefixed one
likewise. The legibility wash carries on as before, just at 0.45
opacity. Older browsers see a slightly lighter block — still
legible, just less heavy than the previous 0.55.

## Risks / Trade-offs

- **Risk: paint cost on dense surfaces (full discography grid, the
  feed's infinite scroll)** → Mitigation: 6px blur on small inline
  rectangles costs negligibly; if any user reports jank we can drop
  to 4px without a behavioural change. Default to 6px.
- **Risk: 0.45 opacity is too light on bright covers and the buttons
  lose contrast** → Mitigation: still well above the 0.30 lower
  bound where item 016's calibration showed the white-on-transparent
  buttons started losing legibility on bright art. The blur
  contributes additional contrast by darkening the bright pixels it
  samples.
- **Trade-off: a tiny inline-style shim grows by two declarations.**
  The wrap helper is the single owner; the cost is one line of
  source.

## Migration Plan

No data migration. Pure CSS update; ships with the next extension
build.

## Open Questions

- Is 4px the better default for the compact `#new-releases-vm`
  tiles? Eyeball during verification; the wrap helper is shared so
  any per-surface override would mean splitting the helper. Default
  6px and revisit only if a tile-specific tweak proves necessary.
