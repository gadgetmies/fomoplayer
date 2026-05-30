## ADDED Requirements

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

### Requirement: Track search MUST accept a `sample:~<id>` token scoped by sample ownership

The system SHALL extend
`packages/back/routes/shared/db/search.js:searchForTracks` to parse
a new token of the form `sample:~<sample_id>` (regex
`/sample:~(\d+)/`). When the token is present in the query string,
the existing track-id subquery MUST be additionally constrained to
tracks that have at least one preview in
`user_notification_audio_sample_match` for the named sample, scoped
to the calling user.

Ownership MUST be enforced in SQL via a NATURAL JOIN against
`user_notification_audio_sample` filtered by the calling user's
`meta_account_user_id`. No new route-level authentication check is
required. Tampered IDs MUST yield an empty result set (not a 403),
matching the existing posture of the `track:~<id>` token.

The new token MUST compose mechanically with the parser's existing
filters: `sample:~5 artist:42` MUST AND-combine the two filters,
and `sample:~5 onlyNew=true` MUST AND-combine the sample filter
with the new-tracks filter. Malformed tokens (e.g. `sample:~abc`)
MUST fall through to the parser's existing free-text fallback used
for malformed `track:~` tokens.

#### Scenario: Owner search returns the matched tracks

- **WHEN** the calling user owns sample 7 and
  `user_notification_audio_sample_match` contains rows mapping
  sample 7 to previews `p1` and `p2`, and the user calls
  `GET /me/tracks?q=sample:~7`
- **THEN** the response contains the tracks owning previews `p1`
  and `p2`

#### Scenario: Non-owner search returns an empty result

- **WHEN** sample 7 is owned by user X and user Y (not user X)
  calls `GET /me/tracks?q=sample:~7`
- **THEN** the response contains zero tracks (not a 403)

#### Scenario: Non-existent sample ID returns an empty result

- **WHEN** there is no row in `user_notification_audio_sample` with
  id 9999 and the user calls `GET /me/tracks?q=sample:~9999`
- **THEN** the response contains zero tracks

#### Scenario: Malformed token falls back to free-text matching

- **WHEN** the user calls `GET /me/tracks?q=sample:~abc`
- **THEN** the parser does NOT apply the sample filter and the
  token is handled by the existing free-text fallback used for
  malformed `track:~` tokens

#### Scenario: Token composes with other filters as AND

- **WHEN** the calling user owns sample 7 with matched previews
  spanning artists 42 and 43, and the user calls
  `GET /me/tracks?q=sample:~7 artist:42`
- **THEN** the response contains only the tracks that both match
  sample 7 AND have artist 42

### Requirement: Default sort for `sample:~` searches MUST be `MAX(match_score) DESC`

The system SHALL, when the search parser identifies a `sample:~<id>`
token AND no explicit `sort=` query parameter is present, override
the default `sort=-released` to
`ORDER BY MAX(user_notification_audio_sample_match_score) DESC` so
the strongest match surfaces first.

When an explicit `sort=…` query parameter is present, that
parameter MUST win — the override SHALL apply only to the default
sort.

#### Scenario: Default sort orders by descending match score

- **WHEN** the user calls `GET /me/tracks?q=sample:~7` (no
  `sort=`) and the matched previews for sample 7 carry scores
  `[40, 90, 60]` for tracks `[t1, t2, t3]`
- **THEN** the response orders the tracks as `[t2, t3, t1]`
  (strongest match first)

#### Scenario: Explicit sort overrides the default

- **WHEN** the user calls `GET /me/tracks?q=sample:~7&sort=-released`
- **THEN** the response orders the tracks by descending release
  date, NOT by `MAX(match_score)`

### Requirement: Settings UI MUST render an inline "N suspected matches" link per audio sample

The system SHALL, inside the audio-samples list at
`packages/front/src/Settings.js`, render an inline anchor element
inside each audio-sample list item, positioned after the file-size
text and before the delete button, when and only when the sample's
`matchCount` is a number `> 0`.

Copy MUST follow:

- `matchCount === 1` → `1 suspected match`
- `matchCount > 1` → `N suspected matches`

The link MUST be hidden entirely when `matchCount === 0`. The link
MUST also be hidden when `matchCount === undefined` (in-flight on
the first Settings load) so the row does not flash from "0" to "N".

The click handler MUST call the existing `this.props.search({ q: \`sample:~\${sample.id}\` })`
flow that the Settings component already uses for other filter
links. The handler MUST call `event.stopPropagation()` so the click
does not also trigger the row-level handlers (e.g. expand-on-click)
that wrap the list item.

The link MUST render with plain text-link styling (not badge
styling), inherit body colour, sit at `font-size: 85%`, and be
separated from the file-size text by a middot at `opacity: 0.4`.
Hover/focus SHALL be underline-only with a focus ring on the link's
own bounding box (no row-level treatment).

#### Scenario: Link hidden when matchCount is 0

- **WHEN** the audio-samples response carries `matchCount: 0` for
  a sample row
- **THEN** the rendered list item contains no "suspected matches"
  link

#### Scenario: Link hidden when matchCount is undefined

- **WHEN** the audio-samples response is in-flight and the sample
  row's `matchCount` is `undefined`
- **THEN** the rendered list item contains no "suspected matches"
  link

#### Scenario: Singular copy at 1

- **WHEN** the audio-samples response carries `matchCount: 1` for
  a sample row
- **THEN** the rendered link reads exactly `1 suspected match`

#### Scenario: Plural copy at N

- **WHEN** the audio-samples response carries `matchCount: 7` for
  a sample row
- **THEN** the rendered link reads exactly `7 suspected matches`

#### Scenario: Click routes to the sample search

- **WHEN** the user clicks a rendered "suspected matches" link for
  sample id 42
- **THEN** the component invokes `this.props.search({ q: 'sample:~42' })`
  exactly once and the click does NOT propagate to the row-level
  handler

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
