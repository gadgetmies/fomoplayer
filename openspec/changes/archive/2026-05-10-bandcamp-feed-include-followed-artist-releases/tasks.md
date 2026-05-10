## 1. Parser

- [x] 1.1 Add `parseFollowedArtistsPanel(html)` to `packages/browser-extension/src/js/content/bandcamp/feed-parse.js`. It first asserts the sentinel `id="new-releases-vm"` is present (throws `FeedShapeError` if absent — that's the login-redirect signal), then globally extracts every `<li class="new-release …" data-item-json="…">` blob from the body via regex on the `class="new-release"` marker (including items with `display: none`), HTML-decodes each, and `JSON.parse`s it. The parser SHALL NOT filter on visibility / inline style. JSON-parse failures on individual items are dropped with `console.warn`; a present sentinel with zero matched items returns `[]`.
- [x] 1.2 Add `mergeReleases(panel, fanDashEntries)` to the same module. Dedup key is `item_url`, fallback `item_id`. First occurrence wins (panel passed first).
- [x] 1.2a Add `partitionBandcampHosted(releases)` to `feed-parse.js` returning `{ kept, dropped }` based on whether each release's `item_url` host is on `*.bandcamp.com`. Releases without an `item_url` are kept (defensive — let downstream decide).
- [x] 1.3 Export both new symbols from `feed-parse.js` alongside the existing exports.

## 2. Worker integration

- [x] 2.1 In `packages/browser-extension/src/js/service_worker.js`, extend `scrapeFeedFromWorker` to discover the logged-in username: prefer `collectionBody.fan?.username || collectionBody.username` from the `collection_summary` body it already fetches; if absent, fetch `https://bandcamp.com/` (the logged-in dashboard) and parse `identities.fan.username` from the `<div id="pagedata" data-blob="…">` blob. Log when the fallback fires so we learn whether `collection_summary` carries the username. If both paths fail, throw the existing "logged out from worker context" error.
- [x] 2.1a Add `parsePagedataUsername(html)` to `packages/browser-extension/src/js/content/bandcamp/feed-parse.js`. It locates `<div id="pagedata" data-blob="…">`, HTML-decodes and `JSON.parse`s the blob, and returns `identities.fan.username` if it is a non-empty string. Returns `null` (does not throw) on any missing-link, parse error, or wrong shape — the caller decides how to handle.
- [x] 2.2 Before the paginated `fan_dash_feed_updates` loop, fetch `https://bandcamp.com/<username>/feed` with `credentials: 'include'`, read the response body as text, and pass it through `parseFollowedArtistsPanel`. Surface non-2xx with a typed error that names the panel fetch and the status code.
- [x] 2.3 Accumulate the panel results via the existing `ingestBandcampFeedReleases({ data, done: false })` path before entering the loop. Do not change the loop's terminal `done: true` semantics.
- [x] 2.3a Filter both the panel result and each `fan_dash_feed_updates` page through `partitionBandcampHosted` before they reach `ingestBandcampFeedReleases`. Log a single per-source `console.warn` summarising the dropped count and the dropped URLs (truncated) so we can observe coverage loss.
- [x] 2.4 In the paginated loop, run each page's `parseFeedPage` result through `mergeReleases` against the accumulated panel results so the `data` array passed to `ingestBandcampFeedReleases` is deduplicated against the panel before being forwarded.
- [x] 2.5 Confirm `manifest.base.json` requires no new `host_permissions` or `permissions` entries — `bandcamp.com` is already covered.

## 3. Tests

- [x] 3.1 Add a panel-parser test fixture set under `packages/browser-extension/src/js/content/bandcamp/__tests__/feed-parse.test.js` (or the project's existing test file for this module): happy path with two items, empty panel, missing container, and a hidden-items fixture (three items, two carrying `style="display: none"`) — the parser must return all three.
- [x] 3.2 Add a `mergeReleases` test that exercises the dedup path: one shared `item_url`, one shared `item_id` only, and one disjoint pair. Verify panel-first precedence.
- [x] 3.3 Verify all parser tests pass and the worker module still type-checks (or lints) with the new imports.

## 4. Local verification

- [x] 4.1 Build the extension, load it unpacked, run Feed sync from a logged-in tab on `bandcamp.com`, and confirm at least one release present in the followed-artists panel of `temp/feed.html` (or the live page) reaches Fomo Player. Confirm a release present in both sources is ingested exactly once. Specifically verify that a release initially hidden behind "show more new releases" (i.e. one of the items past the visible cutoff in the captured fixture's 40 items) is also ingested.
- [x] 4.2 Run Feed sync from a logged-in tab on an artist subdomain (e.g. `someartist.bandcamp.com`) and confirm the same combined coverage.
- [x] 4.3 Run Feed sync while logged out and confirm the popup surfaces the existing human-readable error (no new error category, no raw stack trace).

## 5. Wrap-up

- [x] 5.1 Move backlog symlink: `mv backlog/todo/c-025-bandcamp-feed-include-followed-artist-releases backlog/in-progress/c-025-bandcamp-feed-include-followed-artist-releases` when starting the implementation.
- [x] 5.2 On user verification, move it on to `to-be-verified/` (or the next status); do not self-archive the OpenSpec change without explicit user verification. _Moved to `backlog/validated/mc-025-…` after user-confirmed verification on 2026-05-10._
