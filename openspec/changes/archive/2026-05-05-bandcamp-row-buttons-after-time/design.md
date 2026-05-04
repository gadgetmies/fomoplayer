## Context

The current per-row injection appends the Fomo Player button wrap to
the entire `.track-title` (or `.title-col`) cell, after every existing
child. That puts it after the row's natural right anchor — the `.time`
span — visually *and* in DOM order, but only by accident: cells in
Bandcamp's row layout sometimes float or wrap, so the wrap can drift
above or below the row's centre line. To keep things visually steady
the wrap was given `margin-left: 8px`, which papers over the issue
without fixing it. Mounting the wrap as the immediate next sibling of
`.time` makes the placement explicit and lets Bandcamp's row styles do
the alignment work.

## Goals / Non-Goals

**Goals:**
- Place each per-row `[data-fp-injected]` immediately after the row's
  `.time` span as siblings.
- Drop the `margin-left: 8px` shim from the wrap.
- Stay idempotent — re-running the injection MUST NOT duplicate the
  wrap.

**Non-Goals:**
- Restyle, recolour, or resize the buttons (item 016).
- Vertically align the buttons with the cart icon (item 018).
- Touch the title-section, discography-grid, or feed injections.

## Decisions

### Use the `.time` span as the anchor; fall back to the cell append on absence

Bandcamp's track-row markup consistently includes a `.time` span as the
last child of the title cell on release pages. Anchoring on that span
matches the spec's wording and makes the placement explicit. On the
rare row that lacks a `.time` span (unusual pre-release pages, or
Bandcamp markup variants we haven't seen), keep the previous
append-into-cell behaviour as a safety net so we don't regress those
pages.

**Alternative considered:** Insert at a fixed offset from the cart link
or play column. Rejected — those vary between row variants more than
`.time` does.

### Use `insertAdjacentElement('afterend', wrap)` for placement

The DOM API provides a clean way to insert as the next sibling, which
is what the spec requires. Implementation is one call instead of the
parent-and-nextSibling dance.

## Risks / Trade-offs

- **Risk:** Some rows lack `.time` (live release pages with pre-release
  rows). → Mitigation: fall back to the previous append-into-cell
  path with a console warning.
- **Trade-off:** Without the `margin-left` shim the buttons sit
  visually closer to `.time`. That's intentional — the row already has
  Bandcamp-native spacing between cells, and the `gap: 6px` between
  the button trio remains, so the row reads as `time | Play Queue
  Add` with even spacing.
