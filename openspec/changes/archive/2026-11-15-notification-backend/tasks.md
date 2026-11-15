## 1. Match offset and tempo

- [x] 1.1 Migration adding `user_notification_audio_sample_match_offset_seconds` and `_tempo_factor` (up/down SQL + JS driver)
- [x] 1.2 `persistSampleMatches` writes offset/tempo on insert and update
- [x] 1.3 `scripts/rescore-sample-matches.sql` writes offset/tempo
- [x] 1.4 Test: round-trip and rescore keeps `matched_at` / `notified_at`

## 2. Notification event table

- [x] 2.1 Migration creating `user_notification_event` (FKs with cascade, one-source CHECK, unique indexes, unread partial index)
- [x] 2.2 `persistSampleMatches` inserts an event per newly inserted match
- [x] 2.3 Search-notification job: select subscriptions regardless of email verification, insert events per found track in the job transaction, schedule email only for verified owners
- [x] 2.4 `setTrackHeard` with `heard = true` marks the user's unread events for the track read
- [x] 2.5 Tests: job events (verified / unverified / re-run), sample-match events (new vs rescore, drop cascades)

## 3. Events API

- [x] 3.1 DB queries: list events (paginated, reason + track shape), unread count, mark read (all / track ids)
- [x] 3.2 Routes `GET /notifications/events`, `GET /notifications/events/unread-count`, `POST /notifications/events/read` with input validation
- [x] 3.3 Tests: pagination, unread count, mark read, heard marks read, unsubscribe cascade, user isolation, 400 on bad input

## 4. Sample matches and Sounds like

- [x] 4.1 Route + query `GET /notifications/audio-samples/:id/matches` (ownership 404, score order, match details, unread)
- [x] 4.2 Query module for Sounds like (ANN over preview embeddings, exclusions, similarity) and follow tally
- [x] 4.3 Route `GET /notifications/audio-samples/:id/similar` (ownership 404, pending without embedding, limit clamp)
- [x] 4.4 Tests: matches endpoint; similar ordering, exclusions, follow tally, pending

## 5. Ship

- [x] 5.1 Full back-end suite green; clean atomic commits
- [ ] 5.2 Push branch, open PR, confirm preview environment deploy
- [ ] 5.3 Document the post-deploy bulk rescore in the PR body
