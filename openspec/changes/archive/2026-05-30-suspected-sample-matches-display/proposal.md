## Why

The exact-match scorer
(`packages/back/routes/admin/db.js:findExactMatchForSample`) identifies
store previews that match a user-uploaded notification audio sample,
but nothing in the user-facing UI surfaces those matches — the scorer
is reachable only via admin endpoints. Users with curated audio
samples have no way to see, from Settings, which tracks in the
catalogue suspectedly match each sample.

This change adds the display layer and the data shape needed for it,
**without** wiring the analyser write path. The match table ships
empty; the UI surfaces nothing until a separate change starts writing
matches.

## What Changes

- New `user_notification_audio_sample_match` table that stores
  per-sample → per-preview match rows with the scoring config that
  produced each row (score, threshold, bucket_seconds, matched_at).
- Extend `GET /me/notifications/audio-samples` so each sample row
  carries `matchCount` (additive field; no breaking change).
- Extend the shared track-search parser
  (`packages/back/routes/shared/db/search.js:searchForTracks`) with a
  new `sample:~<sample_id>` token, scoped by ownership through
  `user_notification_audio_sample`. When no explicit sort is
  requested, `sample:~` searches sort by
  `MAX(user_notification_audio_sample_match_score) DESC`.
- Settings UI: render an inline "N suspected matches" link inside
  each audio-sample list item; clicking routes the user to a
  `sample:~<id>` search via the existing `props.search()` flow.
- Add a project-wide "Database naming conventions" note to
  `CLAUDE.md` documenting the table-prefix + FK-mirror rules that
  the new table follows (rules already used across the schema; this
  just makes them explicit so future tables stay NATURAL-JOIN safe).
- No new HTTP routes. No new frontend page. No analyser changes.

## Capabilities

### New Capabilities

- `suspected-sample-matches-display`: storage, count exposure, and
  search-token plumbing that lets the existing Settings page show
  per-sample match counts and the existing search-results page list
  matched tracks via a `sample:~<id>` query.

### Modified Capabilities

(none — no existing spec covers the audio-samples endpoint or the
search-token parser today.)

## Impact

- **New table:** `user_notification_audio_sample_match` with composite
  PK on `(user_notification_audio_sample_id, store__track_preview_id)`,
  both FKs `ON DELETE CASCADE`, and a secondary index on
  `user_notification_audio_sample_id` to support the per-sample COUNT
  and the search-filter join. One up/down migration pair under
  `packages/back/migrations/sqls/` with a matching `.js` driver.
- **Backend:**
  - `packages/back/routes/users/db.js:queryNotificationAudioSamples`
    gains a LEFT JOIN LATERAL `COUNT(*)` so the response includes
    `matchCount`.
  - `packages/back/routes/shared/db/search.js:searchForTracks` learns
    the `sample:~<id>` token alongside the existing `track:~<id>`
    token. The added clause uses NATURAL JOIN through
    `user_notification_audio_sample` so ownership is enforced in SQL
    (no new route-level auth check).
- **Frontend:** `packages/front/src/Settings.js` renders an inline
  link inside each audio-sample list item, after the file-size text
  and before the delete button. Hidden when
  `matchCount === 0 || matchCount === undefined`. Clicking calls the
  existing `this.props.search({ q: 'sample:~<id>' })` flow.
- **Docs:** `CLAUDE.md` gains a short "Database naming conventions"
  block documenting table-prefixed column names and FK columns that
  mirror the parent PK column name (for NATURAL JOIN safety).
- **No production behaviour change on day one.** The match table is
  empty until a separate change wires the analyser writer; the
  Settings UI is byte-identical to today's render until that
  happens, and `sample:~<id>` searches return empty result sets.
- **API contract:** `GET /me/notifications/audio-samples` adds one
  additive field. The existing Settings UI ignores unknown fields,
  so a rolled-back front-end against the new backend is safe.
- **Read-path auth:** Both reads piggyback on existing endpoints
  scoped by `meta_account_user_id`. The new search-token clause is
  ownership-scoped in SQL via NATURAL JOIN, mirroring the existing
  `track:~<id>` posture (empty result, not 403, on tampered IDs).
