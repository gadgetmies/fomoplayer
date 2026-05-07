---
id: 025
title: Include "New Releases from artists you follow" in Bandcamp feed sync
effort: M
created: 2026-05-05
---

# Include "New Releases from artists you follow" in Bandcamp feed sync

## Why

The popup's Bandcamp Feed sync currently only ingests entries returned
by `https://bandcamp.com/fan_dash_feed_updates` (filtered to
`story_type === 'nr'`). The Bandcamp `/<user>/feed` page also renders
a separate **"New Releases from artists you follow"** panel whose
items do not appear in the `fan_dash_feed_updates` response — they are
hydrated separately into the page (likely from a `pagedata` blob or
companion endpoint). Today those releases never reach Fomo Player, so
a user who relies on Feed sync to keep up with followed artists has a
silent gap in coverage.

The fix is to extend the worker-driven feed sync (item 021 / the
`bandcamp-feed-sync-worker` change) so that it ingests both sources
and forwards the combined, deduplicated set to Fomo Player as a
single `releases` stream.

## What

- Identify the source of the "New Releases from artists you follow"
  panel data on the feed page. Two likely shapes:
  1. The data is embedded in the feed-page HTML inside a `<script
     id="pagedata">` blob or an inline JSON island the page hydrates
     from.
  2. The data is fetched from a separate (un-officially documented)
     endpoint after the page mounts.
- The reference data the user has captured locally lives in
  `temp/feed.html` (the rendered feed page) and `temp/feed.json` (the
  `fan_dash_feed_updates` response). Diff them to confirm which items
  are unique to the panel and locate the embedded source.
- Extend the worker's feed-sync flow so it pulls *both* sources:
  - Continue calling `fan_dash_feed_updates` with the existing
    paginated `older_than` loop.
  - Additionally fetch / parse the followed-artists panel — either
    by GETting `https://bandcamp.com/<user>/feed` once and pulling
    the embedded blob, or by hitting whichever endpoint the panel
    uses.
- Merge the two streams into a single deduplicated `releases` payload
  (key on `item_url`, falling back to `item_id`), then emit the same
  `releases` message the worker emits today.
- Add a fixture-based unit test that exercises the merge / dedup path
  against synthetic versions of the two sources.

## Acceptance criteria

- [ ] Running Feed sync on a logged-in tab ingests every release that
      appears in the followed-artists panel on the feed page, in
      addition to the entries from `fan_dash_feed_updates`.
- [ ] Releases that appear in both sources are emitted exactly once
      in the resulting `releases` stream.
- [ ] The popup's progress / error UX is unchanged from item 021's
      worker-driven flow — no new error categories, no duplicate
      progress ticks.
- [ ] Captured reference data (`temp/feed.html`, `temp/feed.json`)
      stays usable as a sanity check against future shape shifts.
- [ ] No regression to `fan_dash_feed_updates`-only ingestion or to
      wishlist sync.

## Code pointers

- `packages/browser-extension/src/js/service_worker.js` — worker
  feed-sync handler added by item 021. Extension point for the
  combined source.
- `packages/browser-extension/src/js/content/bandcamp/feed-parse.js`
  — existing parser for `fan_dash_feed_updates`. Add a sibling
  parser for the followed-artists panel embed.
- `temp/feed.html` / `temp/feed.json` — reference data the user
  captured locally; not committed.

## Out of scope

- Adding caching across sync runs.
- Reworking the feed-sync UI.
- Moving wishlist sync into the worker — separate item if needed.

## Open questions

- Is the followed-artists panel data embedded in the feed-page HTML
  (`pagedata`-style) or fetched from a separate endpoint? Resolve
  by reading `temp/feed.html` first.
- If embedded, is it already JSON-shaped (parseable as-is) or an
  HTML fragment that needs DOM scraping?
- What is the right deduplication key? `item_url` is the safest
  human-stable id; `item_id` is denser but Bandcamp has reused ids
  across stores in the past. Default to `item_url`, fall back to
  `item_id`.
