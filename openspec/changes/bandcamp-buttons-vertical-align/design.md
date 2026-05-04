## Context

The injected button wrap is `display: inline-flex; gap: 6px;
vertical-align: middle;` and contains three shadow hosts (each
`<span>` with `display: inline-block`). Inside, the cart-toggle's
`<button class="toggle">` packs an `<svg>` icon next to a label `span`
via `display: inline-flex; align-items: center`. The SVG is
`width: 11px; height: 11px;` with no `vertical-align` rule, so it
inherits the inline default (`baseline`). Even with the button itself
flex-centring its children, the host's intrinsic baseline ends up a
pixel below the cue button's because the cue button has no inline
content with an alternate baseline.

The cue-button host (`<span>` `display: inline-block`) wraps a
`<button>` with the same `display: inline-flex; align-items: center;
line-height: 1.4` rules but no SVG inside, so the host's content box
is purely text-driven. The visible result: the cart button reads as
1px lower than the cue buttons in every wrap they share.

## Goals / Non-Goals

**Goals:**
- All three buttons in a `[data-fp-injected]` wrap (Play, Queue,
  Add-to-Fomo-Player) render on the same vertical centre line within
  1px on the release-title section, per-track rows, and discography
  overlays.
- The fix survives the next Bandcamp markup tweak — i.e. it does not
  rely on a magic margin offset, but on explicit `align-items: center`
  on the wrap and the shadow hosts.

**Non-Goals:**
- Restyle the buttons (item 016).
- Replace the cart icon SVG.
- Touch any other surface (popup, embedded player, etc.).

## Decisions

### Centre on the wrap **and** on each shadow host

The wrap's inline-flex layout will get explicit `align-items: center`
so the hosts share a single centre line. Each shadow host (`:host`
in `cueButton` and `cart-button`) will switch from `inline-block` to
`inline-flex; align-items: center` so the inner button isn't pushed
down by the host's intrinsic baseline.

**Alternative considered:** Force a fixed height on every button.
Rejected because Bandcamp pages have wildly varying base font
metrics, and a fixed height would break alignment on pages where the
host computes a different intrinsic height.

### Anchor the SVG explicitly in the cart toggle

Add `display: block; vertical-align: middle` to the cart-button
shadow's `svg` rule. With the button already `display: inline-flex;
align-items: center`, `display: block` removes any leftover baseline
contribution from the SVG and lets the flex layout do all the work.

**Alternative considered:** `vertical-align: middle` alone. Works
in most browsers but `display: block` is unambiguous and the
shadow-DOM scope means it can't bleed into Bandcamp's own SVGs.

## Risks / Trade-offs

- **Risk:** Switching `:host` to `inline-flex` could affect layout in
  surfaces where the host is wrapped by Bandcamp-native flex
  containers (release title section, discography tile overlay). →
  Mitigation: the wrap's intrinsic size is unchanged; it still flows
  inline. Any change is invisible because the wrap's own content was
  already flex-centred internally.
- **Trade-off:** The fix touches two files that are otherwise
  decoupled (`inject.js` and `cart-button.js`). Worth it — both
  shadow hosts are the moving parts of the alignment, and pinning
  only one would leave the bug live on the other.
