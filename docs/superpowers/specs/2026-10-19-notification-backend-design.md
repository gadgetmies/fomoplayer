# Notification backend — design

Change 1 of 3 for the notifications / sample-playback redesign (Claude Design
canvas "Sample Match Playback", https://claude.ai/artifact/5srUyRFRmXn44kcCiZBUqA).
The other two changes build on this one:

1. **notification-backend** (this change) — data and API only, no UI.
2. **one-player** — one audio owner: source list and "Playing from", a docked
   mini player on Settings, samples played through the Preview panel with
   aligned A/B and loop-match.
3. **notifications-page** — top-level Notifications page (Activity / Samples /
   Subscriptions), bell with unread count in the top bar, Settings ›
   Notifications renamed Email, notify bells on Following.

## Goal

Give the later UI changes the data they need:

- where in the preview each sample match sits and at which tempo, so A/B can
  switch on the same beat;
- a record of every notification (a track that arrived for a search
  subscription or as a sample match) with an unread state, for the Activity
  feed and the bell count;
- "Sounds like" — tracks whose audio embedding is closest to a sample's.

## Today

- `matchFingerprints` (`routes/shared/db/fingerprint-matching.js`) returns
  `peak_offset_seconds` (= `preview_pos − a·sample_pos` at the peak) and
  `peak_tempo_factor` (`a`) per match; `persistSampleMatches`
  (`routes/admin/db.js`) keeps only the preview id and score.
- The search-notification job (`jobs/notifications.js`) emails new tracks and
  advances `user_search_notification_last_update`; it records nothing per
  track and skips users without a verified email.
- Artist / label "notify" is a search subscription with text `artist:<id>` /
  `label:<id>`.
- Sample embeddings (`user_notification_audio_sample_embedding`, TEXT type) and
  preview embeddings (`store__track_preview_embedding`, enum type, HNSW cosine
  index) are both 1280-d `discogs_multi_embeddings-effnet-bs64-1`, mean over
  patches, so they are directly comparable. Nothing queries sample embeddings
  for users.

## Design

### 1. Match offset and tempo

Migration adds to `user_notification_audio_sample_match`:

- `user_notification_audio_sample_match_offset_seconds DOUBLE PRECISION` —
  where the sample starts inside the preview audio (the matcher's
  `peak_offset_seconds`);
- `user_notification_audio_sample_match_tempo_factor DOUBLE PRECISION` — the
  matcher's `peak_tempo_factor`; 1.0 = same tempo.

Both nullable: existing rows have none until rescored. `persistSampleMatches`
writes both (and updates them on conflict); `scripts/rescore-sample-matches.sql`
does the same. After deploy, a bulk rescore through the existing
`POST /api/admin/exact-match/audio-samples/matches` path fills old rows.

### 2. Notification events and unread

Table `user_notification_event`:

| column | type |
|---|---|
| `user_notification_event_id` | SERIAL PK |
| `meta_account_user_id` | FK meta_account(meta_account_user_id) ON DELETE CASCADE |
| `track_id` | FK track ON DELETE CASCADE — the id track lists, heard reports and `queryTrackDetails` use |
| `user_search_notification_id` | nullable FK ON DELETE CASCADE |
| `user_notification_audio_sample_id`, `store__track_preview_id` | nullable composite FK to `user_notification_audio_sample_match` ON DELETE CASCADE |
| `user_notification_event_created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() |
| `user_notification_event_read_at` | TIMESTAMPTZ NULL — NULL = unread |

- CHECK: exactly one source (search subscription, or sample match) is set.
- Unique indexes: (user, search notification, track) and (user, sample,
  preview), so re-running a job never duplicates an event.
- Partial index on unread rows per user for the bell count.
- Column names follow the schema's NATURAL JOIN rules (non-FK columns
  prefixed, FK columns named after the parent PK).
- Cascades: unsubscribing, deleting a sample, or a rescore dropping a match
  removes its events.

Writers:

- The search-notification job writes one event per found track for every
  subscription, whether or not the owner has a verified email; it emails only
  verified owners (unchanged behaviour for email).
- `persistSampleMatches` writes one event for the sample's owner per match row
  it inserts (not on re-score of an existing row).

Unread rule — **played only**: an event is unread until its track is played
(the existing heard report `POST /api/me/tracks/:id {heard: true}` marks that
user's unread events for the track read, wherever it was played) or the user
marks everything read.

API, under `/api/me/notifications`:

- `GET /events?limit=50&before=<eventId>` — newest first. Each item:
  `{ id, createdAt, read, reason, track }`. `reason` is
  `{ type: 'search', notificationId, text, displayName }` or
  `{ type: 'sample', sampleId, filename }`; `track` is the shape the track
  lists use, so the player can play it.
- `GET /events/unread-count` → `{ count }` (polled by the bell).
- `POST /events/read` with `{ all: true }` or `{ trackIds: [...] }` →
  `{ count }` of rows marked.

### 3. Sample matches and Sounds like

`GET /api/me/notifications/audio-samples/:id/matches` — the sample's matches,
highest score first: track shape plus
`match: { previewId, score, offsetSeconds, tempoFactor, matchedAt }` and
`unread` (the match's event exists and is unread). `offsetSeconds` is relative
to the preview audio; the UI maps it to the track with the preview's start.
Null offset/tempo (not yet rescored) means "play from the start". 404 when the
sample is not the caller's. `sample:~<id>` search is unchanged so email links
keep working.

`GET /api/me/notifications/audio-samples/:id/similar?limit=20` — nearest
previews to the sample's embedding by cosine distance over the HNSW index
(sample type cast to the enum, same `EMBEDDING_TYPE` constant as cart
similarity), one row per track, excluding tracks that are already fingerprint
matches of the sample and the user's ignored artists / labels / tracks.
Response:
`{ tracks: [...track shape + similarity (0–1)], follow: [{ type, id, name, count, followed }], pending: false }`
where `follow` tallies the returned tracks' artists and labels (top 5, marking
those already followed). No embedding yet → `{ tracks: [], follow: [], pending: true }`.

## Error handling

- Unknown or foreign sample id → 404 on both sample endpoints.
- Invalid `limit` / `before` → 400 (clamped `limit` 1–200).
- Event writes in the jobs run in the same transaction as the work they
  record; a job failure leaves no half-written events.

## Testing

cascade-test, `packages/back/test/tests/`:

- `admin/sample-match-persist-offset-tempo.js` — offset/tempo round-trip;
  rescore keeps `matched_at` / `notified_at`; one event per new match; a dropped
  match cascades its event.
- `jobs/notification-events.js` — search job writes events for verified and
  unverified owners, emails only verified; re-run doesn't duplicate.
- `users/notification-events.js` — list, pagination, unread count, mark read by
  track and all, heard marks read, unsubscribe cascades, user isolation.
- `users/notification-audio-sample-matches.js` and
  `users/notification-audio-sample-similar.js` — shape, ownership 404,
  exclusions, follow tally, `pending` without an embedding; fixed vectors make
  the neighbour order deterministic.

No UI in this change, so no demo tests; changes 2 and 3 add them.

## Out of scope

Email frequency settings, event retention, backfilling Activity history.
