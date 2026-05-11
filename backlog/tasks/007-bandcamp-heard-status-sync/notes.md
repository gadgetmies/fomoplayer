# Notes

## Decisions

- **OpenSpec change**: `sync-bandcamp-listens-to-fomo-player` covers
  this task. The new capability is `bandcamp-heard-status`.
- **Lookup endpoint shape**: `POST /api/me/tracks/heard-lookup` with
  `{ store: 'bandcamp', ids: string[] }` returning a map
  `{ <bandcampId>: { trackId, heard: ISO|null } | null }`. POST chosen
  over GET because release / feed pages can have many ids and URL
  length under GET is fragile across CDNs.
- **No backend schema changes** — read-only join over `store__track`,
  `track`, and `user__track`. The endpoint must not side-effect
  (asserted by a row-count + timestamp snapshot test).
- **Heard reporting was already in place** in `audio-player.js` — the
  `play` audio event already triggers `bandcamp:report-heard` with no
  time threshold. We extracted it into `heard-reporting.js`
  (`attachHeardReporting`) so it can be unit-tested in mocha without
  needing a browser DOM. Runtime behaviour is preserved.
- **Recently Played edge is verified, not modified** — the existing
  `recently_heard` CTE in `queryUserTracks` already orders by
  `user__track_heard DESC`. We added end-to-end tests that exercise
  the edge so a future query change cannot silently desync the
  Bandcamp listen → Recently Played path.

## Rejected approaches

- **Extending the ingest endpoint with `dryRun`**: would overload a
  write endpoint with read semantics and add a footgun (callers that
  forget the flag mass-ingest). Rejected in favour of a separate
  read-only endpoint.
- **Indicators on discography tiles and feed entries (in this
  iteration)**: those DOM surfaces only expose album / track URLs, not
  Bandcamp track ids. Rendering indicators on them would require one
  `fetchReleaseTralbum` per tile on page load — too expensive on a
  page that can hold dozens of tiles. The spec scopes those surfaces
  out and notes that a follow-up change can extend the lookup to
  accept Bandcamp URLs alongside track ids, enabling those surfaces
  without per-tile fetches.
- **Hooking Bandcamp's native player events** to mark heard on native
  playback: out of scope and brittle. Task wording is "via the
  extension" — the extension's embedded audio host is the source of
  truth for playback events.

## Open threads

- Backend tests for the new endpoint and the Recently Played edge are
  in `packages/back/test/tests/users/heard-lookup.js` and
  `packages/back/test/tests/users/bandcamp-recently-played.js`. They
  pass our local syntax/structure checks but `initDb()` failed against
  the current local test database with FK errors that also affect
  other unrelated tests (`undo-heard.js` fails with a missing-table
  error). The test database likely needs a re-init; this is local
  environment, not the new tests.
- Follow-up: extend `POST /api/me/tracks/heard-lookup` to accept
  Bandcamp URLs (`urls: string[]`) so discography and feed surfaces
  can participate without per-tile fetches. Files a new backlog item
  after this lands.

## Session log

- 2026-05-11: Authored OpenSpec change
  `sync-bandcamp-listens-to-fomo-player` (proposal, design, specs,
  tasks) and implemented backend lookup endpoint, extension
  service-worker handler, content-script indicator on release-page
  track rows, and the heard-reporting refactor + unit tests. Trimmed
  scope to release-page rows after discovering discography / feed
  surfaces would require per-tile fetches to resolve track ids.
