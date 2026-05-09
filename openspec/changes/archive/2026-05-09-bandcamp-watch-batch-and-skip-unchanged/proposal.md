## Why

The scheduled Bandcamp watch job (`fetchBandcampWatches`) iterates
every followed artist, label, and playlist on each tick and `GET`s
the per-release page for every release the followee has ever
published — even ones we already have stored. Bandcamp's unofficial
endpoints rate-limit aggressively, the job has been observed to bail
out mid-run, and the same followees trip the cap on the next tick
because there's no fairness in the order of processing. Net effect:
new releases from late-alphabet artists are never picked up on a
busy account.

Two missing primitives cause this:

1. There's no way to ask the job "process N followees this tick";
   it processes the entire follow list in one pass.
2. There's no per-followee request-count cap; an artist with 200
   releases triggers 201 requests every tick regardless of whether
   anything changed.

## What Changes

- Add a `batchSize` option to `artistFetchJob`, `labelFetchJob`, and
  `playlistFetchJob` (`packages/back/jobs/watches/shared/logic.js`)
  that caps the number of followees processed per run. Default
  remains "no limit" so other watch flows (Beatport, Spotify, etc.)
  are unaffected.
- Order followee processing by `last_updated ASC` so each tick
  picks up the least-recently-refreshed followees first; rotation
  is fair across ticks without a separate cursor table. Update the
  followee-detail queries in
  `packages/back/jobs/watches/shared/db.js`.
- Surface `batchSize` through `fetch-bandcamp-watches.js` and wire
  it into the schedule in `packages/back/job-scheduling.js` (start
  with a conservative number, tunable from the schedule config).
- Reduce per-followee request count: in `getArtistTracks` /
  `getLabelTracks`
  (`packages/back/routes/stores/bandcamp/logic.js`), parse the
  artist/label page once and use the embedded release-list metadata
  (`pagedata` / `TralbumCollectionsData`) to skip per-release fetches
  for releases already in the DB whose `release_date` precedes the
  followee's `last_updated`.
- Record `requestCount` on the operation source row so the
  operations admin page can show per-tick request budgets and
  rate-limit hits.

Not in scope: switching to a hypothetical official Bandcamp API,
adding rate-limit avoidance to ad-hoc release ingest from the
extension popup, or reworking the worker-driven feed sync (covered
by `bandcamp-feed-sync`).

## Capabilities

### New Capabilities
- `bandcamp-watch-fetch`: the scheduled job that refreshes followed
  Bandcamp artists, labels, and playlists. Covers batch-size /
  fairness invariants, the conditional-fetch skip rule, and the
  request-count observability contract.

### Modified Capabilities
<!-- None — `bandcamp-feed-sync` covers the worker-driven feed scrape, which is a separate flow with its own rate characteristics. -->

## Impact

- **Backend code**:
  - `packages/back/jobs/watches/fetch-bandcamp-watches.js` — accept
    and forward `batchSize`.
  - `packages/back/jobs/watches/shared/logic.js` — thread
    `batchSize` through the per-job loops; integrate the new
    "skip-unchanged" filter on the per-release fan-out.
  - `packages/back/jobs/watches/shared/db.js` — extend followee
    queries with `ORDER BY last_updated ASC` and `LIMIT batchSize`.
  - `packages/back/routes/stores/bandcamp/logic.js` —
    `getArtistTracks` / `getLabelTracks`: parse embedded page-data
    release list and filter against the DB.
  - `packages/back/routes/stores/bandcamp/bandcamp-api.js` — confirm
    or add support for conditional headers if Bandcamp honours them.
  - `packages/back/job-scheduling.js` — pass `batchSize` from the
    schedule config.
  - `packages/back/jobs/watches/shared/db.js` (`insertSource`) —
    record `requestCount` on the operation source row.
- **Operations UI**: per-tick request count surfaces in the
  operations admin page (no new endpoint, just the existing source
  row carrying the new field).
- **Schedule**: the Bandcamp watch tick frequency may change in
  `job-scheduling.js` to accommodate the smaller batch (TBD during
  implementation by measuring rate-limit headroom).
- **Other watch flows**: Beatport / Spotify / Soundcloud watch jobs
  continue to use the default "no batchSize" and are unchanged.
