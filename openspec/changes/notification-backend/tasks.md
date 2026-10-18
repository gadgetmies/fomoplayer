## 1. Match offset and tempo

- [ ] 1.1 Migration adding `user_notification_audio_sample_match_offset_seconds` and `_tempo_factor` (up/down SQL + JS driver)
- [ ] 1.2 `persistSampleMatches` writes offset/tempo on insert and update
- [ ] 1.3 `scripts/rescore-sample-matches.sql` writes offset/tempo
- [ ] 1.4 Test: round-trip and rescore keeps `matched_at` / `notified_at`

## 2. Notification event table

- [ ] 2.1 Migration creating `user_notification_event` (FKs with cascade, one-source CHECK, unique indexes, unread partial index)
- [ ] 2.2 `persistSampleMatches` inserts an event per newly inserted match
- [ ] 2.3 Search-notification job: select subscriptions regardless of email verification, insert events per found track in the job transaction, schedule email only for verified owners
- [ ] 2.4 `setTrackHeard` with `heard = true` marks the user's unread events for the track read
- [ ] 2.5 Tests: job events (verified / unverified / re-run), sample-match events (new vs rescore, drop cascades)

## 3. Events API

- [ ] 3.1 DB queries: list events (paginated, reason + track shape), unread count, mark read (all / track ids)
- [ ] 3.2 Routes `GET /notifications/events`, `GET /notifications/events/unread-count`, `POST /notifications/events/read` with input validation
- [ ] 3.3 Tests: pagination, unread count, mark read, heard marks read, unsubscribe cascade, user isolation, 400 on bad input

## 4. Sample matches and Sounds like

- [ ] 4.1 Route + query `GET /notifications/audio-samples/:id/matches` (ownership 404, score order, match details, unread)
- [ ] 4.2 Query module for Sounds like (ANN over preview embeddings, exclusions, similarity) and follow tally
- [ ] 4.3 Route `GET /notifications/audio-samples/:id/similar` (ownership 404, pending without embedding, limit clamp)
- [ ] 4.4 Tests: matches endpoint; similar ordering, exclusions, follow tally, pending

## 5. Ship

- [ ] 5.1 Full back-end suite green; clean atomic commits
- [ ] 5.2 Push branch, open PR, confirm preview environment deploy
- [ ] 5.3 Document the post-deploy bulk rescore in the PR body
