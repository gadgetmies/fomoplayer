---
id: 030
title: "Recently added" CTE applies LIMIT without ORDER BY — newly ingested tracks rarely surface
effort: S
created: 2026-05-06
---

# "Recently added" CTE applies LIMIT without ORDER BY — newly ingested tracks rarely surface

## Why

Freshly ingested tracks (e.g. via the popup's Bandcamp Feed sync)
land in the DB correctly but rarely show up in the popup / web
"Recently added" view. Confirmed during a Feed-sync verification
session: the `POST /api/me/tracks` succeeded, the rows are present
in `user__track` with current `track_added` timestamps, yet the
view continued to show the same older entries it had before the
sync.

Root cause is in
`packages/back/routes/users/db.js:760-771` — the `recently_added`
CTE applies `LIMIT / OFFSET` with no `ORDER BY`:

```sql
, recently_added AS (
    SELECT track_id
         , MAX(track_added)              -- computed but never used
    FROM logged_user
      NATURAL JOIN user__track
      …
    WHERE (user__track_heard IS NULL OR …)
    GROUP BY 1
    LIMIT ${limits.recent} OFFSET ${offsets.recent}    -- ← no ORDER BY
)
```

Postgres is free to return any `LIMIT N` rows from the unordered
result set. The downstream `recently_added_tracks_with_details`
CTE (`db.js:822-829`) does `ORDER BY added DESC`, but that only
orders the arbitrary subset the inner CTE picked — if a freshly
added track wasn't in the unordered slice, no later sort can
surface it.

The companion CTEs already do this right:

- `new_tracks` (`db.js:556-573`) — `ORDER BY MIN(track_added) DESC`.
- `recently_heard` (`db.js:754-759`) — `ORDER BY user__track_heard DESC NULLS LAST`.

`recently_added` is the odd one out, and the bug has likely been
silent for a long time on accounts where the planner happened to
return recent rows by luck of join order.

## What

- In `packages/back/routes/users/db.js:760-771`, name the
  aggregate alias and add an `ORDER BY` before the `LIMIT`:
  ```sql
  , recently_added AS (
      SELECT track_id, MAX(track_added) AS track_added
      FROM logged_user
        NATURAL JOIN user__track
        NATURAL JOIN track
        NATURAL JOIN store__track
        NATURAL JOIN stores
      WHERE (user__track_heard IS NULL OR (
        ${notHeardBefore}::TIMESTAMP IS NOT NULL
        AND user__track_heard > ${notHeardBefore}::TIMESTAMP))
      GROUP BY track_id
      ORDER BY MAX(track_added) DESC NULLS LAST
      LIMIT ${limits.recent} OFFSET ${offsets.recent}
  )
  ```
- Confirm there's no test asserting a specific (broken) ordering
  for this view before applying. `git log -p
  packages/back/routes/users/db.js` around lines 760-771 for the
  original intent.
- Add (or extend) a backend test in
  `packages/back/test/` that:
  1. Inserts a user with a small catalogue of tracks at different
     `track_added` timestamps;
  2. Runs `queryUserTracks(userId, …, { recent: N }, …)` with N
     smaller than the catalogue size;
  3. Asserts the returned `recentlyAdded` slice contains the most
     recently added tracks in `track_added DESC` order — so
     re-introducing the missing `ORDER BY` regression breaks CI.

## Acceptance criteria

- [ ] Running `queryUserTracks` immediately after ingesting a new
      not-yet-heard track returns that track at (or near) the top
      of `recentlyAdded` — for both empty and non-empty pre-existing
      catalogues.
- [ ] The new test fails when the `ORDER BY MAX(track_added) DESC`
      line is removed from the CTE (proves the test pins the bug).
- [ ] No regression in the `new` or `heard` panels of the same
      query — those CTEs still order correctly.

## Code pointers

- `packages/back/routes/users/db.js:760-771` — `recently_added`
  CTE; the missing `ORDER BY`.
- `packages/back/routes/users/db.js:822-829` —
  `recently_added_tracks_with_details`; downstream consumer; sorts
  the inner CTE's slice by `added DESC` (= `track.track_added`),
  which is fine once the CTE picks the right slice.
- `packages/back/routes/users/db.js:556-573` — `new_tracks`
  pattern to mirror.
- `packages/back/routes/users/db.js:754-759` — `recently_heard`
  pattern to mirror.
- `packages/back/migrations/sqls/20181027103351-init-up.sql:38` —
  `track.track_added` default `NOW()`; confirms it's the DB-insertion
  timestamp the CTE / view rely on.

## Out of scope

- Replacing `track.track_added` with a per-user "track first
  appeared in this user's stream" timestamp. That would be a
  semantic change to "Recently added" (and would need a schema
  migration to add the column to `user__track`); this item is a
  one-line fix to the existing semantics.
- Re-ordering by `user__track.track_added` if such a column
  doesn't exist today — verify the schema before reaching for it.

## Open questions

- Is there a paginated UI that depends on a stable ordering across
  pages? `LIMIT / OFFSET` with no `ORDER BY` produces non-stable
  paging anyway; the fix makes pagination stable as a side effect.
- Should we also add an explicit `ORDER BY` to the
  `recently_added_tracks_with_details` inner SELECT for
  belt-and-braces — `ORDER BY recently_added.track_added DESC`
  rather than `ORDER BY added DESC` — so the join doesn't
  accidentally re-shuffle the slice? Same-result in practice, but
  more self-documenting.
