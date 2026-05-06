---
id: 027
title: Bandcamp watch updates hit API rate limits — add batch-size param + reduce per-item requests
effort: L
created: 2026-05-06
---

# Bandcamp watch updates hit API rate limits — add batch-size param + reduce per-item requests

## Why

The scheduled Bandcamp watch job
(`packages/back/jobs/watches/fetch-bandcamp-watches.js` →
`fetch-operation` → `fetchJobs({ artist, label, playlist })`)
iterates every followed artist, every followed label, and every
followed playlist, and for each one walks the full list of release
URLs and `GET`s each release page individually. Bandcamp's
unofficial endpoints have no documented rate limit; the job has
detected real-world rate-limit responses and now bails out early
when one is encountered (see the `isRateLimit` branches in
`packages/back/jobs/watches/shared/logic.js` and
`packages/back/routes/shared/tracks.js:185-241`). When that happens,
the job stops mid-run and the remaining followees are not refreshed
until the next scheduled tick, by which point the same rate cap
trips again on the same followees.

Two related deficiencies cause this:

1. **No batch-size control.** The job processes every followee in
   one pass. There's no way to ask the operation "process up to N
   followees this run, resume from where you left off next time".
   That makes it impossible to spread the load across multiple
   ticks or to fit within a known per-window quota.
2. **Per-followee request count is unbounded.** For an artist with
   N releases, the job issues 1 (artist page) + N (per-release
   details) requests. Many of those releases haven't changed since
   the last refresh, but we re-fetch them anyway. There's no
   conditional fetch (no `If-Modified-Since` / ETag), no use of the
   artist page's already-hydrated release metadata, and no skip for
   releases whose `release_date` precedes the last sync.

## What

### 1. Batch-size parameter on watch operations

- Extend the watch fetch jobs (`artistFetchJob`, `labelFetchJob`,
  `playlistFetchJob` in
  `packages/back/jobs/watches/shared/logic.js`) to accept a
  `batchSize` option. Default to "no limit" (current behaviour).
- The job should iterate a slice of the followee list — picking the
  *next* batch by oldest `last_updated` timestamp on the followee
  row (artist / label / playlist) so the rotation is fair across
  ticks.
- Surface the parameter through `fetch-bandcamp-watches.js` so the
  scheduler entry point can pass `{ batchSize }` from the schedule
  config.
- Update `job-scheduling.js` to schedule the Bandcamp watch with a
  realistic batch (e.g. 50 artists + 50 labels per tick, run every
  10 minutes — exact numbers TBD during implementation by measuring
  the rate at which Bandcamp blocks).
- Persist progress between ticks via the followee `last_updated`
  ordering — no separate cursor table needed.

### 2. Reduce per-followee request count

Read the artist / label page once and extract as much as possible
from the embedded `pagedata` / `TralbumCollectionsData` JSON before
fanning out to per-release fetches. The Bandcamp artist page already
includes per-release metadata (title, art id, type, release date,
URL) in its page-data payload — that's enough to decide which
releases are *new* relative to what we have stored, and which can
be skipped entirely.

Specifics to investigate during implementation:

- In `packages/back/routes/stores/bandcamp/logic.js:139-167`
  (`getArtistTracks`), parse the artist-page response for the
  embedded release list (with release dates) and filter out
  releases the DB already has *and* that are older than the
  followee's `last_updated`. Only fan out to per-release fetches
  for new / updated releases.
- Same for `getLabelTracks` (`logic.js:170-198`).
- For the per-release fetch in `getTracksFromReleases`
  (`logic.js:93-137`), evaluate whether `bandcamp-api.js`'s
  release fetch is hitting a JSON endpoint or the rendered HTML
  page (the HTML response is cheaper-cache-friendlier; if we're
  already hitting the JSON endpoint, the savings are smaller).
- Consider a single `If-Modified-Since` header carrying the
  followee's `last_updated`. Bandcamp may or may not honour it —
  worth a quick experiment.

### 3. Observability

- The existing rate-limit log lines mention `requestCount`. Make
  sure that count is recorded against the operation's source row
  (`insertSource(...)` in `shared/db.js`) so the operations admin
  page can show "watch tick X processed N artists, M requests, R
  rate-limited".

## Acceptance criteria

- [ ] `artistFetchJob`, `labelFetchJob`, and `playlistFetchJob`
      accept a `batchSize` parameter that caps the number of
      followees processed in a single run.
- [ ] Followee rotation is fair: each scheduler tick picks up the
      least-recently-refreshed followees first, so over enough
      ticks every followee is refreshed.
- [ ] The artist / label fetch path skips per-release fetches for
      releases already in the DB whose `release_date` is older than
      the followee's last successful refresh — the request count
      drops measurably (target: ~80% reduction on a steady-state
      account where most releases are unchanged between ticks).
- [ ] Rate-limit responses still trigger the existing
      circuit-breaker behaviour, and the resume-on-next-tick
      ordering means the bailed-out followees are next in line.
- [ ] Operations admin shows per-tick request counts so the
      reduction is verifiable end-to-end.

## Code pointers

- `packages/back/jobs/watches/fetch-bandcamp-watches.js` — entry
  point; thread the new option through.
- `packages/back/jobs/watches/shared/logic.js:9-140` — the per-job
  loops where batch-size lives.
- `packages/back/routes/shared/tracks.js:185-241` —
  `updateArtistTracks`; this is where the per-release fan-out
  happens via the `getArtistTracks` async generator.
- `packages/back/routes/stores/bandcamp/logic.js:139-198` —
  `getArtistTracks` / `getLabelTracks` async generators. Best place
  to add the "skip releases that haven't changed" filter.
- `packages/back/routes/stores/bandcamp/bandcamp-api.js` — the
  underlying HTTP client; check whether it already supports
  conditional requests (`If-Modified-Since`).
- `packages/back/job-scheduling.js:6` — `fetchBandcampWatches` is
  scheduled here; the schedule + the new `batchSize` are wired
  together.
- `packages/back/jobs/watches/shared/db.js` — followee details
  queries (`getArtistFollowDetails`, etc.). Need to extend these
  to order by `last_updated ASC` and limit by `batchSize`.

## Out of scope

- Adding rate-limit avoidance for non-watch flows (search, ad-hoc
  release ingest from the popup). This item is scoped to the
  scheduled watch operation only.
- Switching to an "official" Bandcamp API. There isn't one for
  these endpoints; the unofficial paths are what we have.
- Reworking the worker-driven feed sync from the browser extension
  (item 021) — that's a different flow with different rate
  characteristics.

## Open questions

- What `batchSize` actually keeps us under Bandcamp's rate cap?
  Need to measure during implementation; pick a starting number
  conservative enough to never hit the cap on a typical Heroku
  worker tick.
- Does Bandcamp's release endpoint honour `If-Modified-Since`?
  Worth a one-day spike before committing to the conditional-fetch
  approach. If it doesn't, the artist-page-based "release date is
  older than last refresh" filter is the main lever.
- Should batch progress be reported in `setStatus` so a long
  rotation surfaces as multiple operations in the admin UI, or
  collapse into one "watch tick" entry per scheduled fire?
