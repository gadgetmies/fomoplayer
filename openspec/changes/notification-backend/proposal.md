## Why

The notifications / sample-playback redesign (Claude Design canvas "Sample Match
Playback") needs data the backend does not keep today: where in a preview a
sample matched and at which tempo (for aligned A/B playback), a per-track record
of notifications with an unread state (for an Activity feed and a bell count),
and audio-similarity search from a sample (for "Sounds like"). This change is
the first of three (backend → one player → Notifications page) and ships the
data and API only. Design: `docs/superpowers/specs/2026-10-19-notification-backend-design.md`.

## What Changes

- Store the matcher's peak offset and tempo factor on each
  `user_notification_audio_sample_match` row (`persistSampleMatches` and the
  rescore script stop dropping them).
- New `user_notification_event` table: one row per track that arrived for a
  search subscription or as a sample match, with `read_at` (NULL = unread).
- The search-notification job writes events for every subscription, including
  owners without a verified email; email stays limited to verified owners.
- `persistSampleMatches` writes an event for each newly inserted match.
- Playing a track (the existing heard report) marks the user's unread events
  for that track read.
- New endpoints under `/api/me/notifications`: `GET /events`,
  `GET /events/unread-count`, `POST /events/read`,
  `GET /audio-samples/:id/matches`, `GET /audio-samples/:id/similar`.

## Capabilities

### New Capabilities
- `notification-events`: per-track notification records with played-only
  unread state, written by the search-notification job and sample-match
  persistence, and the events list / unread count / mark-read API.
- `sample-match-details`: stored offset and tempo per sample match and the
  per-sample matches endpoint that exposes them with the unread flag.
- `sample-sounds-like`: nearest-neighbour search from a sample's audio
  embedding to preview embeddings, with artist / label follow suggestions.

### Modified Capabilities

(none — `sample:~<id>` search and the email notifications keep their current
behaviour)

## Impact

- `packages/back/migrations/` — two migrations (match columns, event table).
- `packages/back/routes/admin/db.js` (`persistSampleMatches`),
  `packages/back/scripts/rescore-sample-matches.sql`.
- `packages/back/jobs/notifications.js`.
- `packages/back/routes/users/{api,db,logic}.js` — new endpoints, heard hook.
- New query module for sample similarity reusing `EMBEDDING_TYPE` from
  `routes/shared/db/cart-similarity.js`.
- Ops: after deploy, run a bulk sample rescore to fill offset/tempo on old rows.
