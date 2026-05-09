# User-tracks query

## Purpose

`queryUserTracks` (`packages/back/routes/users/db.js`) is the single
SQL entry point that powers the popup and web "tracks" views. It
returns three panels — `new`, `recentlyAdded`, and `heard` — each of
which is a slice of the user's library ranked by a different
criterion. This capability covers the panel-level invariants those
slices must satisfy: which timestamp determines order, what "the most
recent N" means at slice and within-slice resolution, and how the
caller-supplied `limits` and `offsets` map onto that ranking. The
implementation lives in a single `WITH` query whose CTEs are the unit
of behaviour referenced here.

## Requirements

### Requirement: Recently-added panel returns the most-recent tracks in chronological order

`queryUserTracks` SHALL return, for the `recentlyAdded` panel, the
most-recently-added tracks in the user's library — ranked by
`track.track_added`, the database-insertion timestamp on the `track`
table — up to the caller-supplied `recent` limit, ordered from most-recent
to least-recent with full timestamp resolution.

`track.track_added` is the timestamp at which the track row was first
inserted into the `track` table (default `NOW()` at row creation). It is
**per-track**, not per-user; multiple users observing the same track see
the same `track_added` value. It is independent of `user__track`, which
records when a user gained their per-user heard / ignored / cart state on
a track.

The slice picked by `LIMIT / OFFSET` MUST be deterministic in
`track_added DESC` order — not an arbitrary slice that the planner
happens to emit — and the within-slice ordering MUST be stable for tracks
sharing a calendar day.

#### Scenario: Freshly-ingested track surfaces at the top

- **GIVEN** a user has a catalogue of N tracks with distinct
  `track.track_added` timestamps, where N > `limits.recent`
- **WHEN** a new row is inserted into `track` with `track_added` newer
  than every existing track in the user's catalogue, and is linked to the
  user via `user__track`
- **AND** `queryUserTracks(userId, …, { recent: limits.recent }, …)` is
  called
- **THEN** the returned `recentlyAdded` array contains the new track at
  index 0
- **AND** the array contains exactly `limits.recent` entries, all in
  strict `track_added DESC` order

#### Scenario: Within-day ordering is stable to the timestamp

- **GIVEN** a user has two tracks whose `track.track_added` values fall
  on the same calendar day but differ by minutes
- **WHEN** `queryUserTracks` returns both in the `recentlyAdded` slice
- **THEN** the track with the later `track_added` timestamp appears
  first, regardless of the calendar-day-truncated `added` field on the
  output row
