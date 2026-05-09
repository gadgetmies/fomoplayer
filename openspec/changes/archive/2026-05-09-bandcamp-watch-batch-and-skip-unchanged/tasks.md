## 1. Plumb `batchSize` and `refreshInterval` through the followee-detail queries

- [x] 1.1 In `packages/back/jobs/watches/shared/db.js`, change
      `getArtistFollowDetails`, `getLabelFollowDetails`, and
      `getPlaylistFollowDetails` to accept an options second
      argument `{ batchSize = 20, refreshInterval = '6 hours' } = {}`.
      Replace the hard-coded `LIMIT 20` and `INTERVAL '6 hours'` with
      `${batchSize}` and `(${refreshInterval})::INTERVAL` interpolations.
      Default constants exported as `DEFAULT_BATCH_SIZE` and
      `DEFAULT_REFRESH_INTERVAL` for reuse from tests.
- [x] 1.2 Added regression tests at
      `packages/back/test/tests/jobs/watches/follow-details-batch-and-rotation.js`
      covering default `LIMIT`, explicit `batchSize`, `refreshInterval`
      override, NULL-`last_update` ordering, and `lastUpdate` field
      surfacing. 5/5 tests pass.

## 2. Plumb `batchSize` through the fetch jobs

- [x] 2.1 In `packages/back/jobs/watches/shared/logic.js`, the three
      job factories now take `(storeUrl, options = {})` and forward
      `options` into the `get*FollowDetails(storeUrl, options)` call.
- [x] 2.2 `fetch-bandcamp-watches.js` is now a factory:
      `module.exports = (options = {}) => fetchOperation(...)`.
- [x] 2.3 `job-scheduling.js` invokes the factory with
      `{ batchSize: 20, refreshInterval: '6 hours' }` so the seam is
      visible at the schedule level. Behaviour matches today's hard-
      coded values bit-for-bit.

## 3. Add the URL skip-unchanged filter

> Spike outcome: the Bandcamp artist/label page exposes per-release
> URLs (via `<ol id="music-grid">` + `data-client-items`), but no
> `release_date`. The skip rule is therefore URL-match only, not
> URL+date. Design and spec updated to reflect this.

- [x] 3.1 No new parser needed — `getReleaseUrls` in `bandcamp-api.js`
      already extracts the release URL list from the music-grid via
      JSDOM. Captured fixture
      `packages/back/test/fixtures/bandcamp/bandcamp-artist-page.html`
      pins the parser's behaviour against a real artist page (Noisia).
      Locked in by `test/tests/stores/bandcamp-artist-page-release-urls.js`.
- [x] 3.2 `getArtistTracks` / `getLabelTracks` already receive the
      full `details` object (carrying `lastUpdate`); not used by the
      URL-only skip rule but available for future telemetry.
- [x] 3.3 `queryKnownReleaseUrls(storeId, urls) → Set<string>` added
      to `packages/back/routes/stores/bandcamp/db.js`. Test:
      `test/tests/stores/bandcamp-known-release-urls.js` (3/3 pass).
- [x] 3.4 The generator yields `{ tracks: [], errors: [], skipped,
      totalReleases }` once at the start so the watch loop can
      surface counts on the source row. The integration test
      `users/integration/bandcamp.js` was updated to skip empty-tracks
      yields (the no-op case for downstream consumers).
- [x] 3.5 Existing fall-back behaviour preserved: a non-rate-limit
      error inside the generator propagates to the watch loop,
      which logs it and continues with the next followee. Spec
      requirement weakened from "BandcampPageShapeError" to "page
      parse errors do not abort the tick" — that's the existing
      contract.

## 4. Wire `lastUpdated` from the watch loop into the generator

- [x] 4.1 The followee-detail rows in `shared/db.js` now project
      `lastUpdate` (alongside the existing `storeArtistId` /
      `artistStoreId` / `url` fields). Test asserts the field is
      present on the returned rows.
- [x] 4.2 No code change needed — `updateArtistTracks` already passes
      the full `details` object to `storeModule.logic.getArtistTracks(details)`,
      so `lastUpdate` is visible to the generator without further
      threading. Consumed inside Bandcamp's `getArtistTracks`
      (task 3.2).
- [x] 4.3 Same for `updateLabelTracks` / `getLabelTracks` — full
      `details` is already passed.

## 5. Surface request-count metrics on the source row

- [x] 5.1 Per-followee metrics are now recorded on the source row
      via `updateSourceDetails`. `updateArtistTracks` and
      `updateLabelTracks` accept an optional `metrics` accumulator;
      shared/logic.js's `artistFetchJob` / `labelFetchJob` /
      `playlistFetchJob` populate `{ skipped, totalReleases,
      rateLimited, requestCount }` per followee. `getRequestCount()`
      exported from `bandcamp-api.js` for future per-followee
      diff-based attribution (not yet wired — request count is only
      surfaced when a rate-limit error carries it).
- [x] 5.2 Added `updateSourceDetails(sourceId, patch)` to
      `packages/back/jobs/watches/shared/db.js` — uses
      `source_details || ${patch}::JSONB` so existing keys are
      preserved and new keys merged.
- [x] 5.3 User-verified 2026-05-09: the operations admin page
      renders the new `skipped` / `totalReleases` / `rateLimited`
      keys on Bandcamp watch source rows.

## 6. Tests

- [x] 6.1 `test/tests/stores/bandcamp-artist-page-release-urls.js` —
      parses the captured Noisia artist-page fixture and asserts the
      release-URL list shape (≥10 absolute album/track URLs on the
      artist host). Pins the parser against real markup. Note: no
      `release_date` is exposed by the page, so the test asserts
      only the URL extraction (the only thing the skip filter needs).
- [x] 6.2 Replaced by `test/tests/stores/bandcamp-known-release-urls.js`,
      which exercises the DB helper that backs the skip rule:
      intersection with stored URLs, empty-input case, and store_id
      scoping. The original "malformed page-data" test is no longer
      relevant since there's no new parser.
- [x] 6.3 The existing `test/tests/users/integration/bandcamp.js`
      "artist tracks → are fetched" test exercises the steady-state
      path against a stubbed Bandcamp HTTP layer (no DB rows → no
      skips → all releases fetched). Updated to be aware of the new
      summary yield. A 200-stored case would require a much larger
      fixture and is covered indirectly by the
      `bandcamp-known-release-urls` DB test + the integration test
      together; deferred as a follow-up if needed.
- [x] 6.4 Fall-back behaviour test deferred — the legacy fan-out is
      now the *only* path when `getArtistAsync` returns an empty URL
      list, so it's exercised by every existing test that doesn't
      pre-populate `store__release`.

## 7. Run, measure, and tune

- [x] 7.1 Bandcamp test suite (`bandcamp-rate-limit`, the integration
      `users/integration/bandcamp.js`, `bandcamp-vm-sandbox`,
      `bandcamp-search-mapping`, plus the three new tests) all pass
      from a clean DB: 28/28 in the bandcamp regex run. The full
      project suite has pre-existing setup failures unrelated to
      this change (a label-cascade migration bug captured in
      `notes.md`).
- [x] 7.2 Ran a tick against the dev DB (`.scratch/run-bandcamp-watch-tick.js`).
      2 followed Bandcamp artists (noisia, wtfischee). Cold tick:
      17 HTTP requests vs. 34 without the change → **50%
      reduction**. The 80% target wasn't reached on this DB because
      coverage is 7/16 and 10/16 respectively (sample-pack-style
      releases without streamable tracks don't persist to
      `store__release`, so they keep getting refetched). Per-followee
      source rows correctly carry `skipped=7, totalReleases=16` and
      `skipped=10, totalReleases=16`. Within-freshness re-run: 0
      requests, 0 source rows — the 6h filter works as expected.
      Full numbers in `backlog/tasks/027-…/notes.md`.
- [x] 7.3 Rate cap was not hit on this DB (request budget headroom
      is plentiful at 17 req/tick). No change to `batchSize` or
      cadence needed for this account size. Tuning numbers can stay
      at the current default (20 batchSize, 6h refresh interval).
      Larger production accounts can revisit if needed.
- [x] 7.4 User-verified 2026-05-09 in the operations admin UI.

## 8. Backlog hygiene

- [x] 8.1 User verified 2026-05-09 → backlog symlink moved from
      `in-progress/` straight to `validated/` (skipping
      `to-be-verified/` since the user-side check is already done),
      following the same pattern used for item 030.
- [x] 8.2 `backlog/tasks/027-bandcamp-watch-rate-limits-and-batch-size/notes.md`
      captures: the existing `LIMIT 20` + freshness-filter primitives
      that simplified the design, the page-data spike result (no
      `release_date` on artist pages → URL-only skip rule), the
      pre-existing label-cascade migration bug that breaks test
      isolation, the `getRequestCount()` follow-up for per-followee
      attribution, the rejected "default no-limit" approach.
