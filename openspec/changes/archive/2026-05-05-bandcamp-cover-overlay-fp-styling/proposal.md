## Why

The Fomo Player button trio injected on Bandcamp discography cover
images is hard to read in the overlay context. The label
"Add to Fomo Player" is too long for the constrained space and
frequently wraps or visually clips against the cover art. The
buttons inherit the Bandcamp-blue (`#0687f5`) palette used elsewhere,
which clashes with Fomo Player's own brand and offers little contrast
against light or busy cover art behind them. The release-page and
per-track-row buttons have ample room and stay on Bandcamp blue —
this item only restyles the cover overlay.

## What Changes

- On the discography cover overlay (`injectDiscographyButtons` and
  the new feed entry surface from item 002), pass `label: 'Fomo'` to
  `renderCartButton` instead of `'Add to Fomo Player'`. The cart icon
  stays. Queue and Play labels are already short and stay as-is.
- Switch the cover-overlay button colours to the Fomo Player primary
  palette pulled from `packages/front/src/buttons.css`:
  - border `#530059`,
  - background `#b40089`,
  - hover background `#9f0076`,
  - text `#fff`.
- Add a semi-transparent dark backdrop behind the overlay button row
  (a single rounded pill spanning the wrap) so the buttons stay
  readable on top of any cover art.
- Release-page (title-section) and per-track-row buttons remain on
  the original Bandcamp-blue palette and "Add … to Fomo Player"
  labels — only the cover overlay is restyled.

## Capabilities

### New Capabilities
<!-- none — extending bandcamp-track-actions -->

### Modified Capabilities
- `bandcamp-track-actions`: extend the cover-overlay injection
  requirements with the new label, the Fomo Player palette, and the
  legibility backdrop. Per-track-row and release-title rules are
  unchanged.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/inject.js`:
  - `injectDiscographyButtons` (and the feed injector that mirrors
    it) pass a new `variant: 'overlay'` flag plus
    `label: 'Fomo'` to `renderCartButton`, and pass
    `variant: 'overlay'` to `cueButton`.
  - The `[data-fp-injected]` wrap on the cover overlay gains a
    rounded semi-transparent dark backdrop via inline style.
- `packages/browser-extension/src/js/content/bandcamp/cart-button.js`
  and the `cueButton` factory in `inject.js` pick up the new
  `variant` argument and switch palette accordingly. The default
  variant stays on the existing Bandcamp-blue colours so other
  surfaces are untouched.
- No backend, service-worker, or message-protocol changes.
- No new permissions, dependencies, or build steps.
- Out of scope: rolling the FP palette across every other extension
  surface (item 013), adding the same backdrop to the release-page
  controls.
