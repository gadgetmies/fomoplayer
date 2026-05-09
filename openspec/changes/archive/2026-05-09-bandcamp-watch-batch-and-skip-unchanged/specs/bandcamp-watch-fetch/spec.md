## ADDED Requirements

### Requirement: Watch fetch jobs accept a per-tick batch size

The Bandcamp watch fetch jobs (`artistFetchJob`, `labelFetchJob`,
`playlistFetchJob` in
`packages/back/jobs/watches/shared/logic.js`) SHALL accept a
`batchSize` option that caps the number of followees processed in a
single run. The followee-detail SQL query SHALL apply that cap as
its `LIMIT`.

The default value MUST preserve the current behaviour (a hard cap of
20 followees per tick). Other store integrations (Beatport, Spotify,
Soundcloud) that share or copy this job signature MUST keep that
default unless they explicitly override it.

The schedule entry in `packages/back/job-scheduling.js` for the
Bandcamp watch SHALL pass `batchSize` explicitly through
`fetch-bandcamp-watches.js` so the value is visible at one place
when an operator tunes it.

#### Scenario: Default behaviour matches today's hard-coded cap

- **GIVEN** a Bandcamp account with more than 20 eligible followees
  (followees whose `last_updated` is older than the refresh
  interval)
- **WHEN** the watch fetch job runs without an explicit `batchSize`
- **THEN** at most 20 followees are processed in that tick
- **AND** the followees picked are the 20 with the oldest
  `last_updated` (NULLS first)

#### Scenario: Schedule overrides the default to a smaller batch

- **GIVEN** the Bandcamp watch schedule passes `batchSize: 10`
- **WHEN** the watch fetch job runs
- **THEN** at most 10 followees are processed in that tick
- **AND** the next tick picks up the next 10 by `last_updated ASC`,
  achieving fair rotation across ticks

### Requirement: Followee rotation is fair across ticks

The followee-detail SQL queries
(`getArtistFollowDetails`,`getLabelFollowDetails`,
`getPlaylistFollowDetails`) SHALL order results by their
respective `last_update` timestamp ascending with `NULLS FIRST`,
so that:

- Newly-followed entities (NULL `last_update`) are picked up on the
  next tick.
- Otherwise, the least-recently-refreshed followee is processed
  first.

The queries SHALL also continue to filter out followees that have
been refreshed within the configured `refreshInterval` (default
`'6 hours'`). The `refreshInterval` SHALL be configurable via the
same options object that carries `batchSize`.

#### Scenario: Newly-followed artist jumps to the head of the queue

- **GIVEN** a user follows a new Bandcamp artist whose
  `store__artist_last_update` is `NULL`
- **AND** other followees have non-NULL `last_update` values within
  the refresh interval
- **WHEN** the next watch tick runs
- **THEN** the newly-followed artist is among the first to be
  processed

#### Scenario: Recently-refreshed followee is skipped within the window

- **GIVEN** an artist whose `last_update` is 30 minutes ago and the
  `refreshInterval` is `'6 hours'`
- **WHEN** the watch tick runs
- **THEN** that artist is not present in the followee batch
- **AND** is eligible again once the interval elapses

### Requirement: Per-followee request count is bounded by URL skip

For each Bandcamp artist or label fetched via `getArtistTracks` /
`getLabelTracks` in
`packages/back/routes/stores/bandcamp/logic.js`, the implementation
SHALL parse the artist/label page once for its release list and
SHALL skip `getReleaseAsync(url)` for any release URL that is
already present in `store__release` for the Bandcamp store.

URLs that have no entry in `store__release` for the Bandcamp store
MUST still be fetched per-release (current behaviour for those
URLs).

The generator SHALL surface the count of skipped releases so the
caller can include it in the operation source row's metrics.

The artist/label page does not expose per-release `release_date` in
its embedded markup (verified against the captured fixture
`packages/back/test/fixtures/bandcamp/bandcamp-artist-page.html`).
The skip rule is therefore URL-match only — it deliberately does
not detect a release whose Bandcamp URL has been reused for
substantively different content. Such cases are accepted as a
known gap and require a separate manual re-ingest path; this is
not a regression versus today's behaviour because today's behaviour
re-fetches everything regardless.

#### Scenario: Steady-state account makes far fewer requests per tick

- **GIVEN** a followed Bandcamp artist with 200 releases stored in
  `store__release` for the Bandcamp store
- **AND** the artist page lists those 200 release URLs plus 1 new
  URL not yet in `store__release`
- **WHEN** the watch tick processes that artist
- **THEN** exactly 1 `getReleaseAsync` call is issued (for the new
  URL)
- **AND** the generator reports `skipped: 200`

#### Scenario: Artist with no stored history fetches every release

- **GIVEN** a freshly-followed artist whose `last_updated` is `NULL`
- **AND** none of the artist's release URLs are in `store__release`
- **WHEN** the watch tick processes that artist
- **THEN** every listed release URL is fetched per-release
- **AND** the generator reports `skipped: 0`

### Requirement: Page parse errors do not abort the watch tick

If the artist or label page parse raises an error (for example
because Bandcamp changes the page shape and the music-grid selector
no longer matches), the watch loop in
`packages/back/jobs/watches/shared/logic.js` SHALL catch the error,
log the followee URL, and continue with the next followee — the
tick MUST NOT abort the entire job because of one followee.

This is the existing behaviour for non-rate-limit errors and SHALL
NOT regress as part of the URL-skip implementation.

#### Scenario: Artist page response is missing the music-grid

- **GIVEN** an artist whose page response contains no
  `<ol id="music-grid">` element (e.g. Bandcamp markup change)
- **WHEN** the watch tick processes that artist
- **THEN** the followee yields zero releases for the tick (no fan-out
  fetches are attempted)
- **AND** the watch tick continues with the next followee

#### Scenario: One followee throws does not abort the tick

- **GIVEN** a watch batch of three followees where the first one's
  page response is malformed in a way that throws inside the
  generator
- **WHEN** the watch tick processes the batch
- **THEN** the first followee surfaces an error in the tick's error
  list
- **AND** the second and third followees are still processed
  normally

### Requirement: Watch tick records request-count metrics on the source row

At end of each watch tick, the fetch job SHALL update the operation
`source` row inserted by `insertSource` to include, in
`source_details`, an object with at least:

- `requestCount`: total HTTP calls issued during the tick.
- `followeesProcessed`: number of followees fully or partially
  processed.
- `skipped`: total releases skipped via the skip-unchanged filter.
- `rateLimited`: boolean true if the tick bailed out early due to a
  rate-limit response.

These fields MUST be readable by the operations admin page without
requiring a schema migration — the existing JSON column is the
carrier.

#### Scenario: Tick that exhausts its batch reports zero rate-limit hits

- **GIVEN** a tick processes its full `batchSize` followees without
  encountering a rate-limit response
- **WHEN** the tick completes
- **THEN** the source row's `source_details` includes
  `{ rateLimited: false, followeesProcessed: <batchSize>,
  requestCount: <number>, skipped: <number> }`

#### Scenario: Rate-limited tick records the bail-out point

- **GIVEN** a tick that encounters a Bandcamp rate-limit response
  partway through
- **WHEN** the tick exits early per the existing circuit-breaker
  logic
- **THEN** `source_details.rateLimited` is `true`
- **AND** `followeesProcessed` is the count completed before the
  bail-out (less than `batchSize`)
- **AND** the next tick begins with the followees that did not run,
  by virtue of their `last_update` being older than the ones that
  did
