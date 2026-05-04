# Notes

## Decisions

_(empty)_

## Rejected approaches

_(empty)_

## Open threads

_(empty)_

## Session log

- 2026-05-05: Added `onFeedPage()` and `injectFeedButtons()` in
  `packages/browser-extension/src/js/content/bandcamp/inject.js`. Reuses
  `cueButton`, `renderCartButton`, and `fetchReleaseTralbum` so the feed
  picks up the same Play / Queue / Add lifecycle as discography tiles.
  Walks `a[href*="/album/"], a[href*="/track/"]` and mounts the button
  wrap on the nearest `.story-innards` /
  `.collection-item-container` / `.story-fan-collection-item` / `<li>`
  ancestor, de-duped by container so a feed card containing both an
  album link and a track link only gets one wrap. Build (`yarn
  build:chrome`) passes. Live UI verification still owed.
