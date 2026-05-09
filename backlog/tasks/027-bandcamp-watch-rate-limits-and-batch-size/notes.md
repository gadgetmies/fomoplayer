# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-09_ — Hard-coded `LIMIT 20` and `INTERVAL '6 hours'` in the
  followee-detail queries already provided a partial batch primitive +
  fairness rotation. The change is to lift those into options, not to
  reinvent the rotation. Default values preserve existing behaviour
  bit-for-bit so Beatport/Spotify watch jobs (which share the same
  `shared/logic.js`) keep their current cap.
- _2026-05-09_ — `last_update` lives on `store__artist` /
  `store__label` (not on the watch tables, despite the column name
  prefix). Test fixtures need to set `store__artist_last_update` on
  the `store__artist` row, then insert a `store__artist_watch` row
  with no extra fields.
- _2026-05-09_ — Schedule-side seam lives in `job-scheduling.js`'s
  require, not via a runtime arg. Pattern:
  `require('./jobs/watches/fetch-bandcamp-watches')({ batchSize, refreshInterval })`.
  Keeps `runJob`'s signature unchanged.

## Rejected approaches

- _2026-05-09_ — Defaulting `batchSize` to "no limit" at the SQL
  layer (per the original proposal language) would silently change
  behaviour for Beatport/Spotify watch jobs that import the same
  `shared/logic.js` factories without passing options. Defaulted to
  20 (current value) instead.

## Open threads

- _2026-05-09_ — **Page-data shape is unknown** for Bandcamp artist /
  label pages. The wishlist page exposes `<div id="pagedata"
  data-blob="…">` with release dates (used by
  `packages/browser-extension/src/js/content/bandcamp/wishlist.js`),
  but artist pages aren't proven to have the same blob. Need to
  capture a real artist-page response and inspect before writing the
  parser for the skip-unchanged filter. Without this, the per-followee
  request count reduction (Group 3 in the openspec change) can't
  proceed.
- _2026-05-09_ — Per-followee request count attribution: `requestCount`
  in `bandcamp-api.js` is a module-level counter that resets on the
  rate-limit window expiring. To attribute requests to a specific
  followee, expose a `getRequestCount()` getter and diff before/after.
  Worth doing as part of Group 5.1 once Group 3 is in place.
- _2026-05-09_ — Pre-existing test-infra issue: the `20221018000000-init-up.sql`
  pg_dump migration adds the `store__label_watch__user_store__label_watch_id_fkey`
  FK on the wrong table (`store__label_watch` instead of
  `store__label_watch__user`), so cascade-deletes don't reach
  `store__label_watch__user`. Orphan rows from failed test runs
  accumulate and break subsequent runs. Manual `TRUNCATE store__label_watch__user
  CASCADE` clears it. Same pattern likely affects `store__artist_watch__user` —
  worth checking the dump for that one too. This breaks the
  `recently-added-ordering` test on master too — pre-existing, not
  caused by item 030 or 027. Probably worth a separate small backlog
  item to fix the migration and re-dump.

## Session log

- _2026-05-09_ — Bootstrapped openspec change
  `bandcamp-watch-batch-and-skip-unchanged`. Implemented Group 1
  (db.js options + regression test, 5/5 pass), Group 2 (logic.js +
  fetch-bandcamp-watches + job-scheduling wiring), Group 4 (lastUpdate
  threading via the existing details object), Group 5.2 (the
  `updateSourceDetails` helper). Paused before Group 3 (page-data
  parser + skip-unchanged filter) pending capture of a real Bandcamp
  artist-page response.
- _2026-05-09_ — User captured a real Noisia artist-page response.
  Spike outcome: artist page exposes `<ol id="music-grid">` +
  `data-client-items` JSON with per-release `{ url, title, type, art_id }`
  but **no `release_date` anywhere**. Skip rule simplified to "URL
  already in `store__release` for the Bandcamp store" (URL-only,
  not URL+date). Spec, design, and tasks updated. Implemented Groups
  3, 5.1, plus updated the existing integration test for the new
  summary yield. Full Bandcamp test regex run: 28/28 pass.
- _2026-05-09_ — 7.2 measurement on the dev DB (2 followed artists,
  17 stored releases between them):
  - **Cold tick (stale, partial coverage):** 17 HTTP requests
    (2 artist pages + 15 release pages). Source rows recorded
    `skipped=7, totalReleases=16` for noisia and
    `skipped=10, totalReleases=16` for wtfischee. Without the change,
    the same tick would have issued 34 requests (2 + 16 + 16) — so
    a **50% reduction** at the current dev-DB coverage level.
  - **Within-freshness re-run (6h):** 0 HTTP requests, 0 source
    rows. The freshness filter skips both followees correctly.
  - **80% target:** not hit on dev DB because release coverage is
    7/16 and 10/16 respectively. Sample-pack releases without
    streamable tracks don't get persisted to `store__release`, so
    those slots stay "to be fetched" indefinitely. On a long-running
    real account where most releases have streaming previews, the
    skip rate climbs as `store__release` fills up.
  - **Side observation:** the per-followee `requestCount` field on
    the source row is `-` in this run because the rate-limit branch
    didn't fire. Per-followee request count via `getRequestCount()`
    diff is the obvious follow-up if/when the dev DB hits real
    counts.
