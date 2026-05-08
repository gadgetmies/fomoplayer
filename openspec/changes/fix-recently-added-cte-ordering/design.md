## Context

`queryUserTracks` (`packages/back/routes/users/db.js:489`) builds a single
SQL query with three sibling CTEs that each carry `LIMIT / OFFSET`:

```
new_tracks            ORDER BY MIN(track_added) DESC  ✓
recently_heard        ORDER BY user__track_heard DESC NULLS LAST  ✓
recently_added        (no ORDER BY)                   ✗  ← bug
```

Postgres is free to return any N rows for an unordered `LIMIT`, so
`recently_added` returns whatever the join order happens to produce. The
downstream `recently_added_tracks_with_details` CTE re-sorts the slice by
`cast(track_details->>'added' AS DATE)` — a date-resolution sort over an
arbitrary slice — and the JSON output is shipped to the client.

`track.track_added` is the per-track DB-insertion timestamp on the
`track` table (default `NOW()`, set once at row creation). It is **not**
a per-user "added to my library" value. The fan-out in the CTE comes
from the joins through `store__track NATURAL JOIN stores`: a track in N
stores produces N rows. The original CTE collapses that fan-out via
`GROUP BY track_id` plus an unused `MAX(track_added)` aggregate.

The fix is two SQL edits: pick the right slice in the inner CTE, then
sort the slice on the right column in the outer CTE.

## Goals / Non-Goals

**Goals:**
- The `recently_added` slice picked by `LIMIT / OFFSET` is the
  most-recent-N by full-resolution `track_added`.
- Within the slice, ordering is stable down to the timestamp (not the
  date), so two tracks added five minutes apart on the same day appear
  in the right order.
- The new CTE shape expresses intent directly: dedupe the per-store
  fan-out, then take the N most recent.
- A regression test fails when either `ORDER BY` is removed.

**Non-Goals:**
- Replacing `track.track_added` with a per-user "first appeared in this
  user's stream" timestamp. That would be a semantic change and a
  schema migration; out of scope per the backlog brief.
- Removing the `store__track NATURAL JOIN stores` joins. They look
  redundant in isolation but they implement the per-call `stores`
  filter (the `stores` CTE at line 502-507 is parameterised on the
  caller-supplied list, and the natural join restricts the result to
  tracks present in the requested stores). Same shape as `new_tracks`
  and `recently_heard`. Removing them would silently drop the filter.
- Reworking the meta CTEs (`new_tracks_meta`, `recent_tracks_meta`)
  or the score-calculation chain.
- Minting a broader `user-tracks-query` capability spec covering the
  whole 350-line query function. The new spec is scoped to the
  ordering invariants this fix establishes.

## Decisions

### Decision 1: Use `SELECT DISTINCT track_id, track_added` instead of `GROUP BY` + aggregate

`track.track_added` is per-track (lives on the `track` table). After the
joins, every row for a given `track_id` carries the same `track_added`
value, so the original `MAX(track_added)` was redundant ceremony — the
aggregate had only one input value per group. The CTE only needs to:

1. Filter by user (`logged_user`), heard-status, and the per-call
   `stores` filter (the joins).
2. Dedupe the per-store fan-out so each track appears once.
3. Pick the N most-recently-added.

`SELECT DISTINCT track_id, track_added` does (2) directly, and
`ORDER BY track_added DESC NULLS LAST LIMIT N OFFSET M` does (3). No
`GROUP BY`, no aggregate.

**Alternative considered — keep `GROUP BY track_id` and reference
`track_added` without an aggregate (relying on Postgres's
primary-key functional-dependency recognition).** Rejected:
recognition through `NATURAL JOIN` of a CTE-projected column is at
best edge-case territory and at worst silently breaks under future
Postgres upgrades. `DISTINCT` is unambiguous.

**Alternative considered — keep `GROUP BY track_id, track_added`.**
Equivalent in result; `DISTINCT` is one keyword shorter and reads as
"unique track rows" rather than "groups of one."

### Decision 2: Outer sort uses `recently_added.track_added`, not `added`

`recently_added_tracks_with_details` currently sorts by `added` —
which is `cast(track_details->>'added' AS DATE)`, a date-resolution
projection from the materialised `track_details` view. Two tracks added
five minutes apart on the same calendar day sort arbitrarily.

After Decision 1, the inner CTE exposes `track_added` as a full
`TIMESTAMP WITH TIME ZONE`. Joining the outer query against
`recently_added` and sorting by `recently_added.track_added DESC` gives
stable, full-resolution ordering at zero extra cost.

**Why not also fix `added` to be a TIMESTAMP cast at the
`track_details` source?** That would touch every consumer of
`track_details->>'added'` (frontend included) and risk display drift.
The local fix at the CTE join site is sufficient and contained.

### Decision 3: Narrow capability spec scope

OpenSpec capability specs name and pin behaviour for *living* surfaces
worth re-reading at every change. `queryUserTracks` is one of dozens of
DB query helpers in `routes/users/db.js`; specifying ordering invariants
for each is overkill. The new `user-tracks-query` capability spec covers
only the recently-added ordering invariant this fix establishes. If a
future change reshapes more of the user-tracks query surface, the spec
can grow then.

## Risks / Trade-offs

- **Risk: query plan regression on large catalogues.**
  → Mitigation: `new_tracks` already does `GROUP BY` + `ORDER BY` over
  the same join shape and is the dominant cost in this query.
  `DISTINCT` + `ORDER BY` over the same shape is comparable. Worth a
  manual `EXPLAIN ANALYZE` at implementation time, but no regression
  expected.

- **Risk: pagination of "Recently added" was relying on the broken
  ordering for some accidental property.**
  → Mitigation: pagination over an unordered LIMIT is non-deterministic
  by construction; any UI that did rely on it was already broken on
  page-2+. The fix makes pagination correct as a side effect. No UI
  contract change.

- **Trade-off: not also normalising `added` everywhere.** The outer
  sort tightening is local; a `track_details->>'added'` consumer
  elsewhere may still see DATE-resolution timestamps. Acceptable —
  this fix targets the ordering bug, not the wire format.
