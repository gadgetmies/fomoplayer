# Notes

## Decisions

_(empty)_

## Rejected approaches

_(empty)_

## Open threads

_(empty)_

## Session log

- 2026-05-05: Extended `bandcamp:get-carts` in
  `packages/browser-extension/src/js/service_worker.js` to optionally
  accept `releases` and return per-cart `containsTrackIds`. The
  worker resolves the releases via the existing
  `buildQueueItemsFromReleases` ingest, then fans out via
  `Promise.all` to fetch each cart's `/api/me/carts/:id` and filter
  to the requested track IDs. `bandcamp:add-to-cart` now also returns
  `addedTrackIds` so the dropdown can mark the row in-cart in place.
  The dropdown (`cart-button.js`) sends the resolved releases on
  open, renders in-cart rows with a `MINUS_ICON` and a `#eef5ff`
  tinted idle background, and routes clicks to a new `runRemove`
  path that reuses the existing `setRowState` and `pending`
  lifecycle. After a successful add or remove, the row flips
  in-place via `setMembership` and the dropdown stays open. Build
  (`yarn build:chrome`) passes; live remove and re-add still owed.

## Open threads

- Item 010's spec said the dropdown closes after a successful add.
  This item changes that to "stay open with the row flipped". Worth
  capturing in the bandcamp-track-actions spec as a MODIFIED
  Requirement next time someone touches that section, rather than
  letting two requirements quietly contradict.
