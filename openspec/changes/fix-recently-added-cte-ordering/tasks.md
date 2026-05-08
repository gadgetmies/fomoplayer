## 1. Verify scope before editing

- [x] 1.1 `git log -p packages/back/routes/users/db.js` around lines
      760-771 to confirm the missing `ORDER BY` is an oversight, not
      load-bearing intent. Confirmed: commit `ca9cf29c` (Apr 2025)
      added `MAX(track_added)` + `GROUP BY 1` to dedupe per-store
      fan-out and *accidentally dropped* the original `ORDER BY
      track_added DESC`. Our fix restores that intent.
- [x] 1.2 Grep `packages/back/test/` for existing assertions on
      `recentlyAdded` ordering or content; if any exist that pin the
      *broken* behaviour, surface them before changing SQL. None
      found — clean slate.

## 2. Fix the inner CTE

- [ ] 2.1 In `packages/back/routes/users/db.js:760-771`, replace the
      `SELECT track_id, MAX(track_added) … GROUP BY 1` body with
      `SELECT DISTINCT track_id, track_added` and add
      `ORDER BY track_added DESC NULLS LAST` immediately before the
      `LIMIT / OFFSET`. Keep the joins through `store__track NATURAL
      JOIN stores` — they implement the per-call `stores` filter.

## 3. Tighten the outer sort

- [ ] 3.1 In `packages/back/routes/users/db.js:822-829`, change
      `ORDER BY added DESC` to
      `ORDER BY recently_added.track_added DESC` so within-day
      ordering uses the full timestamp from the inner CTE rather than
      the date-resolution `added` projection from `track_details`.

## 4. Add the regression test

- [x] 4.1 Create
      `packages/back/test/tests/users/tracks/recently-added-ordering.js`
      following the `cascade-test` + real-Postgres pattern in
      `seed-fixtures.js` (`initDb`, `resolveTestUserId`, `seedTracks`,
      `teardownTracks`).
- [x] 4.2 In setup, seed a small catalogue of tracks linked to the
      test user, then `UPDATE track SET track_added = …` to give them
      strictly-decreasing timestamps spanning multiple calendar days
      (so both the slicing and the within-day ordering invariants are
      exercised). Note: insertion order is *reversed* from age order
      (oldest physical row is the newest track) so the planner can't
      luck into the correct slice without doing a real sort.
- [x] 4.3 Call `queryUserTracks(userId, undefined, { new: 0, recent: K, heard: 0 }, …)`
      with K smaller than the seeded catalogue size and assert:
      - the `recentlyAdded` array length === K
      - the array contains exactly the K most-recent seeded tracks
      - the array is in strict `track_added DESC` order
      - a track inserted with the freshest `track_added` lands at
        index 0
- [x] 4.4 Add a sub-assertion that exercises the within-day case: two
      seeded tracks share a calendar day with `track_added` differing
      by minutes; the later one MUST appear first.
- [x] 4.5 Confirm the test fails when *either* `ORDER BY` clause is
      removed (one at a time) — proves the test pins both halves of
      the fix. Verified:
      - Inner `ORDER BY track_added DESC NULLS LAST` removed → all 3
        tests fail (slice returned in insertion order = oldest first).
      - Outer `ORDER BY recently_added.track_added DESC` reverted to
        `ORDER BY added DESC` → 2 of 3 tests fail (within-day pair
        order is non-deterministic at DATE resolution).
      First iteration of the test had insertion order matching age
      order, so a no-ORDER-BY heap scan accidentally returned the
      right slice and the mutation didn't fail; reversed insertion
      order so the planner has to do real work.

## 5. Run and verify

- [x] 5.1 Run the new cascade-test plus the existing tracks tests
      (`packages/back/test/tests/users/tracks/`) and confirm all
      pass. Confirmed: 29/29 tests pass.
- [x] 5.2 Run a `EXPLAIN ANALYZE` of the updated `queryUserTracks`
      against a seeded DB and sanity-check the plan: the new
      `ORDER BY` on `recently_added` should not introduce a sort step
      meaningfully heavier than the comparable `new_tracks` sort.
      Plan shape: Limit → Unique → Sort (quicksort, 25kB) → Hash Joins.
      Same shape `new_tracks` produces. No regression expected.
- [ ] 5.3 Manually verify in the popup / web "Recently added" view
      that a freshly-ingested track surfaces at the top after a
      Bandcamp Feed sync (the original reproducer).

## 6. Backlog hygiene

- [x] 6.1 Move the backlog symlink from `todo/` to `in-progress/` at
      the start, and to `done/` at archive time. (in-progress
      done; done-move happens at archive.)
- [x] 6.2 Update `backlog/tasks/030-recently-added-cte-missing-order-by/notes.md`
      with one-line entries for any surprises encountered during
      implementation (e.g. plan-shape findings, unexpected test
      flakes), so the next session can skim them. Done — captured the
      DISTINCT-vs-aggregate decision, the dead-joins false alarm, the
      first-iteration test mistake, and the git-log finding.
