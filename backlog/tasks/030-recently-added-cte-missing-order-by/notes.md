# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-08_ — Use `SELECT DISTINCT track_id, track_added` rather than
  `GROUP BY track_id, MAX(track_added)`. `track.track_added` is per-track
  (lives on the `track` table, default `NOW()` at row insertion), so the
  aggregate had only one input value per group and was redundant
  ceremony. `DISTINCT` collapses the per-store fan-out directly.
- _2026-05-08_ — Outer sort uses `recently_added.track_added` (full
  timestamp), not `added` (which is `cast(track_details->>'added' AS DATE)`,
  date-resolution only). The wire format `added` stays untouched —
  changing it would touch every consumer including the frontend.
- _2026-05-08_ — Keep the joins through `store__track NATURAL JOIN
  stores`. They look redundant in isolation but they implement the
  per-call `stores` filter via the parameterised `stores` CTE
  (`db.js:502-507`). Removing them would silently drop the filter.

## Rejected approaches

- _2026-05-08_ — `GROUP BY track_id` referencing `track_added` without
  an aggregate (relying on Postgres's PK functional-dependency
  recognition). Works in practice but is edge-case territory through
  `NATURAL JOIN` of a CTE-projected column. `DISTINCT` is unambiguous.
- _2026-05-08_ — First test draft staggered timestamps in *insertion
  order*: trackIds[0] = newest, trackIds[N-1] = oldest. With this
  shape, a no-ORDER-BY heap scan happens to return the correct slice
  by accident (insertion order matches age order), so the mutation
  test (remove inner ORDER BY) didn't fail. Reversed the staggering
  so trackIds[N-1] is newest — the planner now has to do a real sort,
  and removing the inner ORDER BY produces a different slice.

## Open threads

- None.

## Session log

- _2026-05-07_ — Item created from a Bandcamp Feed sync verification
  session: freshly-ingested tracks weren't surfacing in the popup's
  "Recently added" view despite reaching `user__track` correctly.
- _2026-05-08_ — Implemented in OpenSpec change
  `fix-recently-added-cte-ordering`. Two SQL edits in
  `packages/back/routes/users/db.js`: inner `recently_added` CTE
  (DISTINCT + ORDER BY), outer `recently_added_tracks_with_details`
  sort (use full timestamp). New cascade-test
  `recently-added-ordering.js` covers slice content, DESC ordering,
  within-day stability, and offset paging. Mutation-tested both
  ORDER BY clauses individually — each removal fails the test.
  Git-log archaeology: commit `ca9cf29c` (Apr 2025) introduced the
  bug by adding `MAX` + `GROUP BY 1` to dedupe per-store fan-out and
  accidentally dropping the original `ORDER BY track_added DESC`.
