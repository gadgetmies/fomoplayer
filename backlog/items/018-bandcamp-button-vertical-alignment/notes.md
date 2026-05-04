# Notes

Working notebook for this item.

## Decisions

- _2026-05-04_ — Item filed while working item 001. Queue button
  observed roughly 1–3px below the "Add release to Fomo Player" button
  on the release-title wrap; same offset visible on per-track rows.

## Rejected approaches

- _(none yet)_

## Open threads

- Verify the offset is consistent across both `/album/...` and
  `/track/...` pages and on the discography (`/music`) overlay before
  picking a fix.
- Quickest test: temporarily set both shadow-host buttons to
  `display: inline-flex; align-items: center; height: 22px` and see if
  the offset disappears. If yes, the fix is to lock the host height
  rather than chase baselines.

## Session log

- _2026-05-04_ — Filed.
- _2026-05-05_ — Fixed by anchoring layout in three spots:
  `buttonContainer()` in
  `packages/browser-extension/src/js/content/bandcamp/inject.js` now
  sets `align-items: center` on the wrap; both the `cueButton()`'s
  `:host` and the cart-button shadow `:host` switched from
  `display: inline-block` to `display: inline-flex; align-items:
  center`; and the cart-button's `svg` rule got `display: block;
  vertical-align: middle` so the SVG icon stops contributing a stray
  baseline. Did not need the host-height clamp from the open thread —
  flex-centring was enough. Build (`yarn build:chrome`) passes; live
  pixel measurement still owed.
