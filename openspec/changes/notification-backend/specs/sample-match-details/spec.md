## ADDED Requirements

### Requirement: Sample matches MUST store the matcher's offset and tempo

`user_notification_audio_sample_match` SHALL have nullable
`user_notification_audio_sample_match_offset_seconds` (where the sample starts
inside the preview audio, the matcher's `peak_offset_seconds`) and
`user_notification_audio_sample_match_tempo_factor` (the matcher's
`peak_tempo_factor`). `persistSampleMatches` and
`scripts/rescore-sample-matches.sql` MUST write both on insert and update, and
MUST keep `matched_at` and `notified_at` on update.

#### Scenario: Offset and tempo round-trip
- **WHEN** a match with `peak_offset_seconds = 12.5` and `peak_tempo_factor = 1.02` is persisted
- **THEN** the row stores 12.5 and 1.02

#### Scenario: Rescore updates offset without resetting notification state
- **WHEN** a notified match is rescored with a new offset
- **THEN** the offset changes and `matched_at` / `notified_at` are unchanged

### Requirement: The matches endpoint MUST return a sample's matches with offset, tempo and unread state

`GET /api/me/notifications/audio-samples/:id/matches` SHALL return the
sample's matches ordered by score descending, each a track in the track-list
shape plus `match: { previewId, score, offsetSeconds, tempoFactor, matchedAt }`
and `unread` (true when the match's event exists and is unread). Offset and
tempo MUST be `null` when not stored. A sample that does not belong to the
caller MUST return 404.

#### Scenario: Matches are ordered by score with match details
- **WHEN** the owner requests matches for a sample with two matches
- **THEN** the higher-scoring match is first and both carry `match.offsetSeconds` and `match.tempoFactor`

#### Scenario: Foreign sample
- **WHEN** a user requests matches for another user's sample
- **THEN** the response is 404
