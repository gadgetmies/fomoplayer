## Purpose

Storage and count exposure for a user's audio-sample matches, shown
per sample in the Notifications page's Samples tab, and the link the
sample-match email uses to open a sample there.
The exact-match scorer at
`packages/back/routes/admin/db.js:findExactMatchForSample` already
identifies store previews that match a user's notification audio
sample; this capability exposes those matches to end users.

## Requirements

### Requirement: `user_notification_audio_sample_match` table MUST store per-sample → per-preview matches with scoring config

The system SHALL provide a `user_notification_audio_sample_match`
table with the following shape:

- `user_notification_audio_sample_id` INTEGER NOT NULL, referencing
  `user_notification_audio_sample(user_notification_audio_sample_id)`,
  `ON DELETE CASCADE`.
- `store__track_preview_id` INTEGER NOT NULL, referencing
  `store__track_preview(store__track_preview_id)`,
  `ON DELETE CASCADE`.
- `user_notification_audio_sample_match_score` INTEGER NOT NULL.
- `user_notification_audio_sample_match_threshold` FLOAT NOT NULL.
- `user_notification_audio_sample_match_bucket_seconds` FLOAT NOT NULL.
- `user_notification_audio_sample_match_matched_at` TIMESTAMPTZ NOT NULL
  DEFAULT `NOW()`.
- PRIMARY KEY (`user_notification_audio_sample_id`,
  `store__track_preview_id`).
- Secondary index on `user_notification_audio_sample_id` to support
  per-sample COUNT and the search-filter join.

The migration MUST ship as a forward (`-up.sql`) and backward
(`-down.sql`) pair under `packages/back/migrations/sqls/` with a
matching `.js` driver file. The `-down.sql` MUST drop the table.

No application code (no admin UI, no analyser writer in this change)
SHALL read from or write to this table. Writes are out of scope for
this change. Reads are exclusively done by the two existing
user-scoped endpoints listed in subsequent requirements.

#### Scenario: Migration up creates the table with the documented columns and constraints

- **WHEN** the up migration is applied to a clean database
- **THEN** the `user_notification_audio_sample_match` table exists
  with the six columns above, the composite primary key, both FKs
  with `ON DELETE CASCADE`, and the secondary index on
  `user_notification_audio_sample_id`

#### Scenario: Deleting a referenced sample cascades to its match rows

- **WHEN** a row in `user_notification_audio_sample` is deleted that
  is referenced by one or more `user_notification_audio_sample_match`
  rows
- **THEN** the referencing match rows are automatically removed by
  the database

#### Scenario: Deleting a referenced preview cascades to its match rows

- **WHEN** a row in `store__track_preview` is deleted that is
  referenced by one or more `user_notification_audio_sample_match`
  rows
- **THEN** the referencing match rows are automatically removed by
  the database

#### Scenario: Migration down drops the table

- **WHEN** the down migration is applied
- **THEN** the `user_notification_audio_sample_match` table no
  longer exists in the schema

### Requirement: `GET /me/notifications/audio-samples` MUST return per-sample `matchCount`

The system SHALL extend
`packages/back/routes/users/db.js:queryNotificationAudioSamples` to
return one additional field per audio-sample row, `matchCount`, an
integer `>= 0` produced by a `LEFT JOIN LATERAL` `COUNT(*)` against
`user_notification_audio_sample_match` scoped to the sample row.

The added field MUST be additive: the existing fields (`id`, `url`,
`objectKey`, `fileSize`, `fileType`, `filename`, `createdAt`) and
their semantics remain unchanged.

The endpoint MUST continue to scope rows by the calling user's
`meta_account_user_id`. No new authentication or authorisation
check is required for the count itself — the COUNT is bounded by
the same per-user filter that bounds the rest of the response.

#### Scenario: Empty match table returns `matchCount: 0` for every sample

- **WHEN** the `user_notification_audio_sample_match` table contains
  zero rows and the user has one or more audio samples
- **THEN** `GET /me/notifications/audio-samples` returns each
  sample with `matchCount: 0`

#### Scenario: Populated match table returns the correct per-sample count

- **WHEN** the `user_notification_audio_sample_match` table contains
  three rows for sample A and zero rows for sample B (both owned by
  the calling user)
- **THEN** `GET /me/notifications/audio-samples` returns sample A
  with `matchCount: 3` and sample B with `matchCount: 0`

#### Scenario: Counts are isolated across users

- **WHEN** user X owns sample A with three match rows and user Y
  owns sample C with five match rows, and user X calls
  `GET /me/notifications/audio-samples`
- **THEN** the response includes sample A with `matchCount: 3` and
  does NOT include sample C

### Requirement: Project `CLAUDE.md` MUST document the database naming conventions

The system SHALL include a "Database naming conventions" block in
project `CLAUDE.md` documenting at minimum:

1. All non-FK columns on a table are prefixed with the table name.
2. Foreign-key columns use the exact name of the referenced parent
   primary-key column (not a prefixed variant), so NATURAL JOIN
   composes safely across the schema.

The block MUST state the reason (NATURAL JOIN safety) and MAY
reference canonical existing examples in the schema (e.g. the
`user_notification_audio_sample*` family of tables).

#### Scenario: Naming conventions block exists in CLAUDE.md

- **WHEN** the project `CLAUDE.md` is read
- **THEN** it contains a "Database naming conventions" section
  stating both rules and the NATURAL JOIN rationale

### Requirement: A sample-match email MUST link to the sample in the Samples tab

Each sample section of the sample-match notification email SHALL link its
"Listen now" button, and the matching line of the plain-text version, to
`<frontendURL>/notifications/samples?sample=<sample id>`, with the front-end
address taken from configuration.

#### Scenario: Email for one sample
- **WHEN** sample 7 gets a new fingerprint match and its owner has a verified email
- **THEN** the email's "Listen now" link for that sample is `<frontendURL>/notifications/samples?sample=7`
