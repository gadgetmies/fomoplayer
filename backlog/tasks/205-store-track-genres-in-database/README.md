---
id: 205
title: Store track genres in database
created: 2022-08-26
---
## Current state

The schema and write path exist, but no store integration populates
`track.genres`, so `track__genre` is effectively empty in practice.

What is in place:

- Migration `20240415132219-add-track-genre-up.sql` creates `genre`,
  `store__genre`, `track__genre`, plus a sibling
  `artist__genre` table.
- `packages/back/routes/shared/db/store.js:807-829` —
  `addStoreTrack` inserts into `track__genre` (and
  `artist__genre` for each artist) **iff** the incoming `track`
  payload has a `genres` array.
- `packages/back/routes/shared/db/search.js:30-34` — `genre:<id>`
  search filter is wired up against `track__genre`.

What is **missing**:

- **Spotify**: `routes/stores/spotify/logic.js` only exposes
  `genres` on artists (Spotify's API does not put genres on the
  track), so `track.genres` is never populated from this source.
- **Beatport**: no `genres` reference anywhere under
  `routes/stores/beatport/`.
- **Bandcamp**: no `genres` reference under
  `routes/stores/bandcamp/`. Bandcamp tags would be the natural
  source.

## Remaining scope

- Wire each store integration to extract genre info during scrape /
  ingestion and emit it on the `track.genres` shape consumed by
  `addStoreTrack`. For Spotify, decide whether to use artist genres
  as a fallback or skip entirely.
- Backfill historical tracks once the ingestion side is producing
  data, so the search-by-genre filter is useful on existing rows.