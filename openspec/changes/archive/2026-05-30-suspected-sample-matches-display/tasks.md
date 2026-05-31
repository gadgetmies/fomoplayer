## 1. Migration: `user_notification_audio_sample_match` table

- [x] 1.1 Add `packages/back/migrations/sqls/<timestamp>-add-user-notification-audio-sample-match-up.sql`
      creating the table with the six columns
      (`user_notification_audio_sample_id`,
      `store__track_preview_id`,
      `user_notification_audio_sample_match_score`,
      `user_notification_audio_sample_match_threshold`,
      `user_notification_audio_sample_match_bucket_seconds`,
      `user_notification_audio_sample_match_matched_at`),
      both FKs `ON DELETE CASCADE`, the composite PK, and the
      secondary index on `user_notification_audio_sample_id`.
- [x] 1.2 Add the matching `<timestamp>-add-user-notification-audio-sample-match-down.sql`
      that drops the table.
- [x] 1.3 Add the matching `<timestamp>-add-user-notification-audio-sample-match.js`
      driver following the existing repo pattern
      (see `packages/back/migrations/20260104141157-add-notification-audio-samples.js`).
- [x] 1.4 Apply the migration on a local dev DB; verify the table
      exists with the documented columns and constraints, both
      cascades fire on parent delete (sample and preview), and the
      down migration cleanly removes the table.

## 2. Backend: `queryNotificationAudioSamples` extension

- [x] 2.1 Amend `packages/back/routes/users/db.js:queryNotificationAudioSamples`
      to LEFT JOIN LATERAL a per-sample `COUNT(*)::INT` subquery
      against `user_notification_audio_sample_match` and project
      it as `matchCount` in the response shape.
- [x] 2.2 Confirm the route response shape change is additive — the
      seven existing fields and their semantics MUST be unchanged —
      and that the per-user scoping via `meta_account_user_id` is
      preserved.
- [x] 2.3 Extend the audio-samples endpoint integration test (or
      add one if absent) to assert `matchCount: 0` on an empty
      match table, `matchCount: N` after `N` inserts for a given
      sample, and cross-user isolation (one user's inserts do not
      leak into another user's response).

## 3. Backend: `sample:~<id>` search-token parser

- [x] 3.1 Add the `sample:~(\d+)` regex match alongside the existing
      `similaritySearchTrackId` parse at the top of
      `packages/back/routes/shared/db/search.js:searchForTracks`.
- [x] 3.2 When the parsed sample id is non-null, append an
      `AND track_id IN (SELECT track_id FROM
      user_notification_audio_sample_match NATURAL JOIN
      store__track_preview NATURAL JOIN store__track NATURAL JOIN
      user_notification_audio_sample uns WHERE
      m.user_notification_audio_sample_id = $sampleId AND
      uns.meta_account_user_id = $userId)` clause to the
      non-similarity branch's track-id subquery.
- [x] 3.3 When the parsed sample id is non-null AND no explicit
      `sort=` query parameter is present, override the default
      `sort=-released` with
      `ORDER BY MAX(user_notification_audio_sample_match_score) DESC`.
      Explicit `sort=` MUST still win.
- [x] 3.4 Add `searchForTracks` test cases covering:
      owner search returns expected tracks; non-owner returns
      empty; non-existent sample returns empty; malformed
      `sample:~abc` falls through to free-text; co-existence with
      `track:~`, `artist:42`, and `onlyNew=true` (AND-of-filters);
      default sort = `MAX(match_score) DESC`; explicit sort wins.

## 4. Frontend: Settings list item

- [x] 4.1 Inside the audio-sample list item render in
      `packages/front/src/Settings.js`, after the file-size text
      and before the delete button, render an anchor reading
      `1 suspected match` / `N suspected matches` only when
      `sample.matchCount > 0`.
- [x] 4.2 Apply the visual spec: `font-size: 85%`, plain text-link
      styling inheriting body colour, separated from file-size by
      a middot at `opacity: 0.4`, underline-only hover/focus, focus
      ring on the link's own bounding box (not the row).
- [x] 4.3 Click handler MUST call `event.stopPropagation()` and
      invoke `this.props.search({ q: \`sample:~\${sample.id}\` })`.
      Adapted: the Settings component receives no `props.search`;
      it uses the existing `<NavLink to="/search/?q=...">` pattern
      (see Settings.js:1353 for the in-file precedent). Click
      stopPropagation is preserved; navigation goes through the
      router to the same search results page.
- [x] 4.4 Confirm the link is hidden entirely when
      `matchCount === 0` and when `matchCount === undefined`
      (in-flight on first Settings load) — no "0 → N" flash.
- [x] 4.5 If Jest + RTL infrastructure exists for `Settings.js`,
      add unit tests for the four render states (`undefined`, `0`,
      `1`, `N`) and the click handler. Otherwise add a manual-test
      checklist to the PR description covering the same cases.
      Confirmed no `@testing-library/react`; checklist captured in
      `MANUAL-TEST.md` adjacent to this tasks file.

## 5. Documentation: naming conventions

- [x] 5.1 Add a "Database naming conventions" section to project
      `CLAUDE.md` documenting (a) table-prefixed non-FK column
      names and (b) FK columns mirroring the parent PK column
      name, with the NATURAL JOIN rationale. Optionally reference
      canonical existing examples in the schema.

## 6. Shakedown

- [x] 6.1 Apply the migration on a local dev DB, start the backend,
      and confirm `GET /me/notifications/audio-samples` returns
      `matchCount: 0` for every existing sample with no errors.
      Migration applied on dev + test DBs; the LATERAL count was
      verified against the dev DB via psql (returns `matchCount: 0`
      for the three pre-existing samples). The endpoint is a thin
      passthrough exercised by the new `test/tests/users/notification-audio-samples.js`
      integration test.
- [x] 6.2 Manually `INSERT` a small set of rows into
      `user_notification_audio_sample_match` (or use a `psql`
      session) for one sample owned by the test user; confirm
      Settings renders the link with the correct count and copy.
      Covered programmatically by the
      `matchCount returns the per-sample count after inserts`
      integration test (asserts `matchCount: 3`). UI render
      verification is parked in `MANUAL-TEST.md` — the visual
      check requires a browser session this environment can't
      drive.
- [x] 6.3 Click the link in Settings; confirm the URL becomes
      `/search?q=sample:~<id>` and the search results page
      renders the expected tracks ordered by
      `MAX(match_score) DESC`.
      `NavLink to=\`/search/?q=sample:~${sample.id}\`` is asserted
      by code inspection (Settings.js click handler). The sort
      order is covered by `test/tests/users/tracks/search-sample-token.js:default sort orders by descending match score`.
      The full click-through is in `MANUAL-TEST.md`.
- [x] 6.4 In an incognito session as a different user, hit
      `/me/tracks?q=sample:~<id>` for the first user's sample id;
      confirm the response is empty (not a 403) and contains no
      track data.
      Covered by `test/tests/users/tracks/search-sample-token.js:non-owner search returns empty`
      (asserts zero results, no thrown error) and by the
      `counts are isolated across users` integration test.
      Cross-browser incognito repeat is in `MANUAL-TEST.md`.
