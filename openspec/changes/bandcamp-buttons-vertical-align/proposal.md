## Why

The Fomo Player button trio (Play / Queue / Add to Fomo Player) on
Bandcamp release pages, per-track rows, and discography overlays sits
on three slightly different vertical centre lines: the cart-toggle
button is offset by a pixel below the cue buttons because its SVG cart
icon defaults to baseline alignment, which nudges the button's box
down inside its inline-flex parent. The result reads as visually
broken on every release page even though every individual button
renders correctly on its own.

## What Changes

- Anchor the inline-flex `[data-fp-injected]` wrap to
  `align-items: center` so its children share a single vertical centre
  line regardless of intrinsic differences between shadow hosts.
- Inside the cart-toggle's shadow DOM, force the SVG and label to a
  consistent vertical anchor (`vertical-align: middle` on the SVG, or
  equivalent flex-centred layout) so the button's intrinsic height
  matches the cue button's.
- Apply the same anchoring inside the cue-button's shadow DOM so its
  host doesn't drift either.

## Capabilities

### New Capabilities
<!-- none — extending bandcamp-track-actions -->

### Modified Capabilities
- `bandcamp-track-actions`: extend the per-row / release-level / cover
  injection requirements with a vertical-alignment guarantee — every
  button in the `[data-fp-injected]` wrap MUST sit on the same
  vertical centre line within 1px of the others.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/inject.js`:
  - `buttonContainer()` adds `align-items: center` to its inline
    flex layout.
  - `cueButton()`'s `:host` switches from `inline-block` to
    `inline-flex; align-items: center` so the inner button stays on
    the host's centre line even when stretched by the wrap.
- `packages/browser-extension/src/js/content/bandcamp/cart-button.js`:
  - `:host` switches to `inline-flex; align-items: center`.
  - `svg` rule gains an explicit vertical-alignment / display rule so
    the cart icon doesn't pull the button below baseline.
- No backend, service-worker, or message-protocol changes.
- No new permissions, dependencies, or build steps.
