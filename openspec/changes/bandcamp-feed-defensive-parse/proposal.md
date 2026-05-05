## Why

The popup's Bandcamp Feed sync is currently broken: clicking it on a logged-in
`bandcamp.com` tab throws `TypeError: Cannot read properties of undefined
(reading 'entries')` at `scrapeFeed` in the content script, because Bandcamp's
unofficial `fan_dash_feed_updates` endpoint no longer reliably returns the
`{ stories: { entries: [...], oldest_story_date } }` shape the parser assumes.
Users have no usable error — just a console crash — and the sync silently
stops working until somebody reads the bundle. This is one of the popup's
two primary sync paths, so it needs a hot-fix today rather than waiting on
the larger move-to-worker refactor (item 021).

## What Changes

- Guard the `feed.stories.entries` read site in `scrapeFeed` so a missing
  or wrong-shaped field surfaces a *typed* error with a clear message
  instead of a raw `TypeError`.
- Tighten the `feedResponse.ok` check to also reject non-JSON responses
  (the endpoint can redirect to an HTML login page that `ok` still treats
  as truthy).
- Surface the typed error through the existing `reportError` path so the
  popup shows a single human-readable line ("Bandcamp feed endpoint
  returned an unexpected shape — try re-logging in to bandcamp.com or
  file a bug.") instead of a crash buried in the bundle.
- Add a parser unit test exercising the happy-path shape and the
  missing-field shape, so a future endpoint shift is caught before
  users see it.

## Capabilities

### New Capabilities

- `bandcamp-feed-sync`: defensive parsing of Bandcamp's unofficial
  `fan_dash_feed_updates` response inside the popup's Feed sync flow.

### Modified Capabilities

<!-- none — no existing spec covers feed sync today. -->

## Impact

- `packages/browser-extension/src/js/content/bandcamp.js` — `scrapeFeed`
  parser hardened; new typed `FeedShapeError` thrown at the guard site.
- `packages/browser-extension/test/` — new test file covering parser
  shape handling against fixture inputs.
- No build or runtime dependencies added. No worker / popup wiring
  changes — the existing `reportError` path already surfaces thrown
  errors to the popup UI.
- Out of scope: moving fetches into the worker (item 021 absorbs this
  parser when it ports `scrapeFeed`).
