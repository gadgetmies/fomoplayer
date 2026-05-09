## Context

Investigating `packages/back/jobs/watches/shared/db.js` shows the
followee-detail queries already have two of the primitives the
proposal calls for:

- `LIMIT 20` is hard-coded in
  `getArtistFollowDetails` /`getLabelFollowDetails` /
  `getPlaylistFollowDetails`. So a "batch size" exists today — it's
  just not configurable.
- Each query orders by `<last_update> NULLS FIRST`, so the rotation is
  already fair.
- Each query filters `WHERE last_update IS NULL OR last_update +
  INTERVAL '6 hours' < NOW()`, so a followee won't be re-checked more
  than once every 6 hours.

The two missing levers are therefore (a) making the cap configurable
per scheduled tick, and (b) reducing per-followee request count. (b)
is what produces the rate-limit blowups: a single popular artist
with 200 releases triggers 200 release-page GETs even though only a
handful changed since the last refresh.

The per-release fan-out lives in
`packages/back/routes/stores/bandcamp/logic.js:139-198` —
`getArtistTracks` and `getLabelTracks`, both async generators that
call `getArtistAsync(url)` / `getLabelAsync(url)` to get a flat
`releaseUrls` array, then iterate it calling `getReleaseAsync` per
URL.

A captured artist-page response
(`packages/back/test/fixtures/bandcamp/bandcamp-artist-page.html`)
shows the artist page exposes per-release metadata via
`<ol id="music-grid" data-client-items="[…]">`. Each item is
`{ art_id, band_id, id, page_url, title, type }` — it identifies the
release and its URL, but **does not include `release_date` or any
other date field**. Neither does the rendered HTML around each
`<li data-item-id="album-…">` node, nor any other `data-blob` /
embedded JSON on the page. The earlier proposal language about
"release_date older than last_updated" can't be implemented from the
artist page alone.

Since the only per-followee skip information available without an
extra request is "is this release URL already in our DB", the
implementation collapses to that simpler rule: fetch the artist
page once, parse `data-client-items` for the URL list, look up which
URLs already exist in `store__release` for the Bandcamp store, and
skip per-release fetches for the matches. New URLs (and URLs we've
never seen) still get fetched. This catches the common steady-state
case (most followees have a stable set of releases between ticks);
it does not catch the rare edge case of a label re-uploading content
under an already-known URL with no URL change.

## Goals / Non-Goals

**Goals:**

- Make the per-tick followee cap configurable from the schedule
  config (replacing the hard-coded `LIMIT 20`), so a future operator
  can tune it down on a busy account or up on a quiet one without a
  code change.
- Cut per-followee request count by skipping `getReleaseAsync` calls
  for releases whose `(store_release_url, release_date)` pair is
  already in the DB and whose date predates the followee's last
  refresh.
- Surface the per-tick `requestCount` on the operation source row so
  the operations admin page can show "tick X processed N followees,
  M requests, R rate-limited" without a log scrape.

**Non-Goals:**

- Adding rate-limit avoidance to the ad-hoc release-ingest path
  triggered by the extension popup. That's a different flow with
  different latency characteristics — covered by item 175 if it
  becomes a problem.
- Reworking the worker-driven feed sync (covered by the
  `bandcamp-feed-sync` capability) or moving Bandcamp to an
  "official" API — there isn't one.
- Adding a separate cursor table to track sync progress. The
  `last_updated`-ordered query is already a stable resume cursor.
- Conditional fetches via `If-Modified-Since`. See open questions —
  may be a follow-up if Bandcamp honours it, but the artist-page
  release-list filter is the main lever and self-sufficient.

## Decisions

### 1. `batchSize` is plumbed through every layer; default preserves today's behaviour

`artistFetchJob`, `labelFetchJob`, and `playlistFetchJob` accept an
options object (currently they take only `storeUrl`). The existing
factory call site is `bandcamp.js`'s `fetch-bandcamp-watches.js`,
which is reached from `job-scheduling.js`.

The default for `batchSize` is **20** (the current hard-coded
`LIMIT`), so existing callers (Beatport's analogous job, Spotify's,
etc., if any reuse this signature) and the existing schedule keep
their current behaviour byte-for-byte. The Bandcamp schedule is the
only caller that overrides it for now.

**Alternative considered:** Default to "no limit" (`undefined` → no
`LIMIT` in SQL). Rejected — that would silently change behaviour for
any caller that doesn't pass the new option. Preserving 20 as the
default is the safer default and matches the proposal's language
("default to no limit") only at the *job*-job level, not at the SQL
level.

### 2. Skip-unchanged filter lives in the per-store logic generator, not in `shared/logic.js`

The async-generator boundary in `getArtistTracks` / `getLabelTracks`
is the right seam. By the time control reaches
`packages/back/routes/shared/tracks.js` (`updateArtistTracks`), the
generator has already yielded fetched releases and the consumer
can't tell which ones were "skipped" vs "fetched". Moving the filter
upstream of `getReleaseAsync` keeps the cost reduction local to the
data source that needs it (Bandcamp), and other stores' generators
stay untouched.

The filter logic (revised after the page-data spike):

1. After `getArtistAsync(url)`, parse the artist page's
   `<ol id="music-grid" data-client-items="[…]">` JSON into a
   `[{ pageUrl, title, type }]` list. Resolve `pageUrl` against the
   artist origin to get an absolute URL.
2. Look up which absolute URLs are already present in
   `store__release` for the Bandcamp store (single batched query).
   That set is the skip set.
3. Fetch only the remaining URLs per-release (existing path).
4. Yield `{ tracks: [], errors: [], skipped: N, totalReleases: M }`
   once at the start of the generator so the caller can log
   "skipped N of M releases this tick" without a per-release log
   line storm.

The rule is intentionally conservative: skipping is by URL match
only, not by date. The steady-state win (artist with N stored
releases + 1 new → 1 fetch instead of N+1) holds; the edge case
of "URL re-used with new content" still needs a manual re-ingest
or a different invariant. Catching that case would require a
release-page-side hash or a stored last-fetched timestamp on
`store__release`, neither of which exists today.

**Alternative considered:** Filter in `getTracksFromReleases` by
making it accept a "known release URLs" set. Rejected — that
function still ends up calling `getReleaseAsync` once per skipped
URL (it's where the call lives) unless we duplicate the skip check
inside it, which is the same logic in two places.

### 3. `requestCount` is recorded on the source row, not in a new table

`insertSource` in `packages/back/jobs/watches/shared/db.js` already
takes a `details` JSON blob and returns a `source_id`. Extend the
caller in `playlistFetchJob` / `artistFetchJob` / `labelFetchJob`
to update the source row at end-of-tick with
`{ requestCount, followeesProcessed, skipped, rateLimited }`.

The existing operations admin page already reads `source` rows; no
new endpoint or migration is needed if we use the JSON `source_details`
column. If a future stakeholder asks for time-series queries on
request count, that's a follow-up migration to promote the field
to a typed column.

**Alternative considered:** A separate `watch_tick_metrics` table.
Rejected for now — same data lives where the operation already
lives, no schema migration, and the operations admin already reads
it. Promote later if querying patterns require it.

### 4. Followee-detail query rewrite

Each of the three followee-detail queries (`getArtistFollowDetails`
etc.) takes an `options` second argument:

```js
getArtistFollowDetails(storeUrl, { batchSize = 20, refreshInterval = '6 hours' } = {})
```

The hard-coded `LIMIT 20` becomes `${batchSize}`; the hard-coded
`INTERVAL '6 hours'` becomes `${refreshInterval}` to keep the
batch-size and refresh cadence configurable from the same place.
Default `refreshInterval` is `'6 hours'` (current behaviour).

## Risks / Trade-offs

- **Risk:** The artist-page page-data shape changes silently,
  yielding zero release URLs and starving the ingest. → **Mitigation:**
  Extend the parser with the same defensive-shape guard pattern used
  by `bandcamp-feed-sync` (typed `BandcampPageShapeError` rather than
  a `TypeError`), and treat a parse failure as "fall back to the old
  per-release fan-out for this followee on this tick".
- **Risk:** The skip-unchanged heuristic misses an "updated" release
  (e.g. label re-uploaded a release with new tracks under the same
  URL). → **Mitigation:** The `release_date <= followeeLastUpdated`
  comparison still triggers a fetch when the release date moves
  forward (Bandcamp updates `release_date` on substantive edits).
  For the rare case where the release date doesn't change, the
  staleness window is bounded by the next tick's `release_date >
  last_updated` evaluation when any other release on the same artist
  is newer — eventually the followee's `last_updated` falls behind
  and the skip-unchanged filter loosens.
- **Trade-off:** Lower `batchSize` means more scheduled ticks to
  cover the same follow list, which means more *job-startup*
  overhead per followee processed. The reduction in per-followee
  request count more than makes up for this on Bandcamp accounts
  with > 50 follows; on smaller accounts the trade-off may be
  neutral. Acceptable — small accounts don't trip the rate cap to
  begin with.
- **Risk:** A particularly active artist publishes faster than the
  `refreshInterval` rotation visits them. → **Acknowledged:** the
  `last_updated NULLS FIRST` ordering means a freshly-followed artist
  is at the head of the queue, but a continuously-active artist that
  refreshes every tick can starve newer entries. Out of scope for
  this change; revisit if it shows up in operations.

## Migration Plan

This change is server-only — no DB migration, no API change.

1. Land the followee-detail query changes (`shared/db.js`) and the
   `batchSize` plumbing in `shared/logic.js` and
   `fetch-bandcamp-watches.js`. Default `batchSize=20` keeps the
   current behaviour bit-for-bit.
2. Land the page-data parsing + skip-unchanged filter in
   `routes/stores/bandcamp/logic.js`. Verify that artist pages with
   ≤ 0 releases (a new artist) and ≥ 100 releases (a label-style
   artist) parse correctly.
3. Wire the schedule entry in `job-scheduling.js` to pass an explicit
   `batchSize` (start with 20 to match prior behaviour).
4. Tune `batchSize` and `refreshInterval` against a real account
   over a few ticks; bake the eventual numbers into the schedule
   config.
5. Rollback strategy: revert the schedule wiring (1-line). The
   default in code stays at 20, so reverting the schedule reverts
   the user-visible behaviour. The page-data parser can be guarded
   behind a small `if (process.env.BANDCAMP_WATCH_USE_PAGE_DATA)`
   flag during the rollout and removed once verified.

## Open Questions

- What are the right numbers for `batchSize` and the schedule cadence
  on a real account? Need to measure during step 4 of the migration —
  pick conservative starts (20, every 30 min) and tune.
- Does Bandcamp's release endpoint honour `If-Modified-Since`? Worth
  a one-day spike in a follow-up. If yes, it's an additional savings
  on top of the artist-page skip filter.
- Should the page-data parser cache the parsed page across the same
  tick (in case multiple followees share a label page)? Probably
  not — followees are distinct artists/labels and rarely overlap.
  Defer until measurements suggest otherwise.
