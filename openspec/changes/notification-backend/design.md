## Context

Primary design: `docs/superpowers/specs/2026-10-19-notification-backend-design.md`.
This is change 1 of 3 (backend → one-player → notifications-page). Relevant
current code:

- `routes/shared/db/fingerprint-matching.js` `matchFingerprints` returns
  `peak_offset_seconds` and `peak_tempo_factor`; `routes/admin/db.js`
  `persistSampleMatches` keeps only preview id and score.
- `jobs/notifications.js` `updateNotifications` searches each subscription for
  tracks added since `user_search_notification_last_update`, emails verified
  owners and records nothing per track.
- `routes/shared/db/cart-similarity.js` has `EMBEDDING_TYPE`, the HNSW ANN
  pattern (`SET LOCAL hnsw.ef_search`) and `queryTrackDetails(userId, ids)`,
  which returns tracks in the track-list shape.
- `routes/users/db.js` `setTrackHeard` updates `user__track_heard`.

## Goals / Non-Goals

**Goals:** persist match offset/tempo; one event table with unread state fed by
both notification sources; events API; per-sample matches and Sounds-like
endpoints shaped for the player.

**Non-Goals:** any UI; email frequency; event retention; backfilling past
notifications into events; changing `sample:~` search or email content.

## Decisions

- **One event table, sources as nullable FKs with a CHECK** rather than two
  tables or a polymorphic `(type, ref_id)` pair: real FKs give cascades on
  unsubscribe / sample delete / match drop, and the bell count is one indexed
  query. The sample source is a composite FK to the match row
  (`user_notification_audio_sample_id`, `store__track_preview_id`) so a
  rescore that drops a match drops its event.
- **Events reference `track_id`** (not `store__track_id`): heard state, track
  lists and `queryTrackDetails` are keyed by it, and the search job already
  returns it. Sample-match events resolve preview → store__track → track.
- **Played-only unread, hooked into `setTrackHeard`**: no new front-end call is
  needed, and a track heard on Discover is not shown as unread on the bell.
  Only `heard = true` marks read; un-hearing does not resurrect events.
- **Events written in the same transaction as the job's state change**: in the
  search job, the event insert and the `last_update` bump share the existing
  transaction, so a crash re-processes the window and the unique index
  absorbs duplicates. `persistSampleMatches` inserts events with
  `INSERT … SELECT … RETURNING` from the upsert's newly inserted rows
  (`xmax = 0`).
- **Search job selection splits from email eligibility**: the selection query
  no longer requires a verified email; the email is scheduled only when the
  owner's address is verified. This widens the job to unverified users — the
  existing 20-per-run limit and 6-hour interval keep load bounded.
- **Sounds like reuses the cart-similarity ANN pattern**: a single query vector
  (the sample embedding, cast from TEXT) against
  `store__track_preview_embedding` with `ef_search` ≥ pool size, collapse to
  tracks, exclude matched and ignored tracks, take the top `limit` by cosine
  similarity, then `queryTrackDetails` for the shape. Follow suggestions are a
  tally over the returned tracks' artists and labels in Node.
- **Track shape**: all new endpoints return tracks via `queryTrackDetails` so
  change 2's player can treat them like any list.

## Risks / Trade-offs

- [Old match rows have NULL offset/tempo] → API returns nulls and the UI plays
  from the start; ops runs a bulk rescore after deploy.
- [Unverified users now run search notifications] → bounded by the job's
  existing limit; monitor job duration in Sentry cron.
- [Event table growth without retention] → paginated reads and per-user
  indexes; retention is a follow-up.
- [Sample embedding produced with a different model] → filter on the same
  `EMBEDDING_TYPE`; a sample without that type is `pending`.

## Migration Plan

1. Deploy migrations (additive: two nullable columns, one new table); down
   migrations drop them.
2. Deploy code; new events start accruing from the next job runs.
3. Run the bulk rescore to fill offset/tempo on existing matches.

Rollback: revert the code and run the down migrations; nothing else reads the
new columns or table.

## Open Questions

None blocking.
