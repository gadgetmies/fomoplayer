## Why

The popup's Bandcamp Feed sync currently only ingests entries returned by `https://bandcamp.com/fan_dash_feed_updates` (filtered to `story_type === 'nr'`). The `bandcamp.com/<user>/feed` page also renders a separate **"New Releases from artists you follow"** panel whose items are hydrated from a different source and never appear in `fan_dash_feed_updates`. A user who relies on Feed sync to keep up with followed artists has a silent gap in coverage today.

## What Changes

- Extend the worker-driven Bandcamp feed-sync flow to ingest **both** sources in a single sync run: the existing paginated `fan_dash_feed_updates` loop, **and** the "New Releases from artists you follow" panel surfaced on the feed page.
- Add a parser sibling to `feed-parse.js` that locates the followed-artists panel data on the rendered feed page (embedded `pagedata` blob or companion endpoint, to be confirmed against `temp/feed.html`/`temp/feed.json`) and normalises its items into the same release shape the worker already emits.
- Merge the two streams into a single deduplicated `releases` payload before emitting. Dedup key is `item_url` with `item_id` as a fallback.
- The worker emits the same `releases` and `operationStatus` message stream the popup already consumes — no new error categories, no duplicate progress ticks.
- Add a fixture-based unit test that exercises the merge / dedup path against synthetic versions of the two sources, alongside the existing parser fixture tests.

## Capabilities

### New Capabilities

(None — this extends the existing feed-sync capability.)

### Modified Capabilities

- `bandcamp-feed-sync`: the feed-sync flow now ingests a second source (followed-artists panel) in addition to `fan_dash_feed_updates`, and emits a merged + deduplicated release stream.

## Impact

- **Code**:
  - `packages/browser-extension/src/js/service_worker.js` — feed-sync handler picks up the second source and runs the merge.
  - `packages/browser-extension/src/js/content/bandcamp/feed-parse.js` — new sibling parser for the followed-artists panel; existing `fan_dash_feed_updates` parser unchanged.
  - Worker / parser unit tests — new fixtures and a merge/dedup test.
- **Network**:
  - One additional credentialed fetch per sync run (the feed page or its companion endpoint), against an origin already covered by existing manifest permissions.
- **Manifest / permissions**: unchanged — no new `host_permissions` or `permissions` entries.
- **Popup UX**: unchanged — same buttons, same error UI, same progress ticks. The user simply sees coverage they were silently missing.
- **Backend / Fomo Player API**: unchanged — the worker still forwards a single `releases` stream.
- **Out of scope**: cross-run caching, feed-sync UI rework, moving wishlist sync into the worker.
