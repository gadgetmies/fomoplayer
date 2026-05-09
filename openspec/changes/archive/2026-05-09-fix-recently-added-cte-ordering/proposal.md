## Why

Freshly ingested tracks rarely surface in the popup / web "Recently added"
view because the `recently_added` CTE in `queryUserTracks` applies
`LIMIT / OFFSET` with no `ORDER BY` (`packages/back/routes/users/db.js:760-771`).
Postgres returns an arbitrary slice of N rows, the downstream sort orders that
arbitrary slice, and a freshly-added track that didn't make the slice can
never appear regardless of how recent it is. Confirmed during a Bandcamp
Feed-sync verification: `POST /api/me/tracks` succeeded, rows landed in
`user__track` with current timestamps, yet the view kept showing older
entries.

The companion CTEs `new_tracks` (db.js:572) and `recently_heard` (db.js:757)
already order before `LIMIT`. `recently_added` is the lone outlier and the
bug has likely been silent on accounts where the planner happened to return
recent rows by luck of join order.

## What Changes

- Replace the inner `recently_added` CTE's `MAX(track_added)` aggregate
  with a plain `DISTINCT track_id, track_added` projection and add
  `ORDER BY track_added DESC NULLS LAST` before `LIMIT / OFFSET`. The
  aggregate was redundant: `track_added` lives on the `track` table
  (per-track DB-insertion timestamp, default `NOW()`), so once rows are
  joined and filtered, every group of rows for a given `track_id` shares
  one `track_added` value — `MAX` just adds ceremony. `DISTINCT`
  collapses the per-store fan-out (the joins through `store__track` and
  the `stores` CTE remain — they implement the per-call store filter,
  matching `new_tracks` and `recently_heard`).
- Tighten the outer `recently_added_tracks_with_details` sort
  (`db.js:822-829`) to `ORDER BY recently_added.track_added DESC` — the
  current `ORDER BY added DESC` uses `cast(track_details->>'added' AS DATE)`,
  which collapses within-day timestamps and produces unstable order for
  tracks added on the same calendar day. Using the inner CTE's full
  timestamp restores stable chronological order.
- Add a regression cascade-test under
  `packages/back/test/tests/users/tracks/` that seeds tracks at staggered
  `track_added` timestamps, calls `queryUserTracks` with a `recent` limit
  smaller than the catalogue, and asserts the slice contains the
  most-recent N in `track_added DESC` order. The test must fail when
  either ORDER BY clause is removed.

## Capabilities

### New Capabilities

- `user-tracks-query`: covers the ordering and slicing invariants of
  `queryUserTracks` — the function that backs the popup / web "new",
  "heard", and "recently added" panels. Scoped narrowly to the
  ordering contract this fix establishes; expands later if more of the
  query surface needs to be pinned.

### Modified Capabilities

None.

## Impact

- **Code**: `packages/back/routes/users/db.js` — two SQL edits in the
  `queryUserTracks` CTE chain (lines 760-771 and 822-829).
- **Tests**: one new file
  `packages/back/test/tests/users/tracks/recently-added-ordering.js`
  using the existing `cascade-test` + `seedTracks` real-Postgres pattern
  (mirrors `seed-fixtures.js`).
- **APIs**: no contract change. The shape of the `recentlyAdded` array
  returned by `queryUserTracks` is unchanged; only its content becomes
  correct.
- **Performance**: `DISTINCT` + `ORDER BY track_added DESC` replaces the
  `GROUP BY 1` + unused `MAX` aggregate. Both shapes deduplicate the
  per-store fan-out; `DISTINCT` is the more direct expression of the
  intent. `new_tracks` and `recently_heard` already sort over the same
  join shape, so cost is comparable to the existing CTEs.
- **Risk**: no out-of-tree caller can break — the SQL edits stay inside
  the CTE chain and the JSON output shape is preserved.
