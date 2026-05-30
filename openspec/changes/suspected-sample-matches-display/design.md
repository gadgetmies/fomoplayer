## Context

The exact-match scorer at
`packages/back/routes/admin/db.js:findExactMatchForSample` already
identifies store previews that match a user's notification audio
sample. Today the scorer is reachable only via admin endpoints — no
user-facing surface exposes the result. The audio-samples list
already exists at `packages/front/src/Settings.js:1418-1510`,
populated by `GET /me/notifications/audio-samples`
(`packages/back/routes/users/api.js:471`,
`packages/back/routes/users/db.js:1480`), but each row only shows
filename, file size, and a delete button.

Two existing pieces of infrastructure make a no-new-routes display
viable:

1. The shared track-search parser
   `packages/back/routes/shared/db/search.js:searchForTracks` already
   accepts `track:~<id>` style filter tokens. A new `sample:~<id>`
   token can append to the same track-id subquery the existing
   filters extend.
2. The Settings component already receives `props.search` and uses
   it for click-to-filter affordances (e.g. clicking a followed
   entity). The existing search results page renders the response;
   no new page is required.

The analyser-side write path that would populate the new match table
is **out of scope** for this change. The table ships empty; the UI
surfaces nothing until a separate change wires the writer.

Stakeholders:

- **User with curated audio samples** — wants to discover which
  catalogue tracks the scorer thinks match each sample, without
  asking an admin.
- **Backend operator** — needs the match storage shape to be
  forward-compatible with multiple scoring configurations (so future
  threshold/bucket sweeps can record what produced each row).
- **Future analyser-writer change** — needs a stable, ownership-safe
  insert target with an `ON CONFLICT` shape it can rely on.

## Goals / Non-Goals

**Goals:**

- Add a per-sample → per-preview match table with score + scoring
  config columns so each row records which config produced it.
- Surface per-sample match counts on the existing Settings audio
  samples list without adding new HTTP routes.
- Add a `sample:~<id>` search token that lists matched tracks via
  the existing search results page, ownership-scoped in SQL.
- Keep the change additive: rolled-back front-end against the new
  backend, and rolled-forward front-end against the old backend,
  both continue to work.
- Document the table-prefix + FK-mirror naming rules the new table
  follows so future tables stay NATURAL-JOIN safe.

**Non-Goals:**

- Wiring the analyser (or any process) to insert into
  `user_notification_audio_sample_match`. Day-one state: empty
  table, identical UI to today.
- A dedicated "matches" page. The existing search results UI is
  reused.
- A "last scanned at" affordance on each sample. The match row's
  `matched_at` timestamp answers "when was this match recorded",
  not "when was this sample last scanned"; a true "last scanned"
  cue would need a separate column on
  `user_notification_audio_sample` and is deferred.
- Admin endpoints for the new table. All reads go through the two
  existing user-scoped endpoints.
- Live updates / push. Counts refresh on the existing Settings
  refetch points (mount, upload, delete).

## Decisions

### Decision 1: One match table, composite PK on the two FKs

Store matches in a single table
`user_notification_audio_sample_match` with composite primary key
`(user_notification_audio_sample_id, store__track_preview_id)` and
both FKs `ON DELETE CASCADE`. Scoring config (`*_score`,
`*_threshold`, `*_bucket_seconds`) lives on the row, as does
`*_matched_at` (default `NOW()`).

**Why:** A composite PK prevents duplicate `(sample, preview)`
pairs naturally — when a future writer re-scores a pair it uses
`ON CONFLICT (...) DO UPDATE` and the row updates in place. Putting
the scoring config on the row (rather than in a separate
"scorer_run" table joined in) keeps the read query a single LATERAL
COUNT or a single subquery — no extra JOIN per page render.
Cascading on both FKs guarantees no orphan match rows when either
parent is deleted.

**Alternatives considered:**

- *Surrogate `user_notification_audio_sample_match_id` PK + unique
  constraint on the pair:* Rejected. The surrogate buys nothing
  here — there is no other table that needs to FK to a match row,
  and ON CONFLICT works fine against composite PKs.
- *Separate `sample_match_run` table referenced by `match_run_id`:*
  Rejected for day-one shape. If multiple concurrent scorers ever
  need parallel result sets, a `run` dimension can be added then —
  premature now.
- *Skip the matched_at column:* Rejected. Even without a "last
  scanned" affordance shipping, having the timestamp at write time
  is essentially free and useful for any future "freshness" UI.

### Decision 2: Read path is a LATERAL COUNT, not a JOIN GROUP BY

`queryNotificationAudioSamples`
(`packages/back/routes/users/db.js:1480`) appends a
`LEFT JOIN LATERAL (SELECT COUNT(*)::INT ...) ON TRUE` block. The
COUNT subquery returns 0 (via the LEFT JOIN) when no match rows
exist for a sample.

**Why:** A `LEFT JOIN user_notification_audio_sample_match` +
`GROUP BY` would force every existing column into the GROUP BY clause
— annoying to maintain when the audio-samples row shape evolves. A
LATERAL subquery scopes the aggregation to the row being projected
and keeps the rest of the query untouched. The new secondary index
on `user_notification_audio_sample_id` makes the per-sample COUNT a
single index range scan.

**Alternatives considered:**

- *Two queries (one for samples, one for counts) merged in Node:*
  Rejected. Adds a round trip and Node-side merge code for a
  trivial SQL extension.
- *Materialised view with per-sample counts:* Rejected. Too much
  machinery for a count of rows that won't exceed low thousands
  per sample in any realistic scenario.

### Decision 3: Search token is `sample:~<id>`, parser-level only

Add a new token to
`packages/back/routes/shared/db/search.js:searchForTracks`. The
parser appends an `AND track_id IN (SELECT track_id FROM
user_notification_audio_sample_match NATURAL JOIN
store__track_preview NATURAL JOIN store__track NATURAL JOIN
user_notification_audio_sample WHERE m.user_notification_audio_sample_id
= $sampleId AND uns.meta_account_user_id = $userId)` clause to the
existing non-similarity branch. No new route, no new auth check at
the route level — the SQL is the authorisation boundary.

**Why:** The `track:~<id>` token already exists in the same parser
and uses the same shape. Reusing the parser:

- Keeps `sample:~5 artist:42` and `sample:~5 onlyNew=true` working
  as AND-of-filters for free — every other token already appends
  to the same track-id subquery.
- Avoids creating an "audio samples" route family in the user API
  surface that would have to be authenticated and documented
  separately.
- Lets the existing search results UI render the response with no
  changes.

The NATURAL JOIN on `user_notification_audio_sample uns` is the
ownership gate: if the named sample is not owned by the calling
user, the join yields zero rows and the IN-clause is empty. The
posture matches the existing `track:~<id>` behaviour on tampered
IDs (empty result, not 403).

**Alternatives considered:**

- *Dedicated `GET /me/notifications/audio-samples/<id>/matches`
  route:* Rejected. Adds a new auth surface and a new response
  shape; doesn't compose with other filters like `artist:` /
  `onlyNew`.
- *Token name `match:~<id>`:* Rejected. Ambiguous — could mean
  similarity match, exact match, label match. `sample:~` directly
  names the parameter (a sample ID).
- *Different regex shape (`sample=<id>`):* Rejected. Inconsistent
  with the existing `track:~<id>` token; the parser already has a
  family of `:~` tokens.

### Decision 4: Default sort is `MAX(match_score) DESC` for `sample:~` searches

When no explicit `sort=` query parameter is passed,
`sample:~<id>` searches override the default `sort=-released` to
`ORDER BY MAX(user_notification_audio_sample_match_score) DESC` so
the strongest match surfaces first. An explicit `sort=…` wins.

**Why:** Reading the matches list, the user's mental model is
"which preview does the scorer think matches best?" — released-date
order surfaces irrelevant noise. The override only fires when the
parser identifies a `sample:~` token AND no explicit sort is
present, so it doesn't disturb any other search path.

**Alternatives considered:**

- *No override (use default `-released`):* Rejected. Surfaces
  recent-but-weak matches above older-but-strong matches.
- *Always force match-score sort:* Rejected. The user may want to
  sort the same results by release date or popularity; explicit
  `sort=` should still win.

### Decision 5: Inline link affordance, hidden when count is 0 or undefined

The Settings list item gains exactly one new render element: an
anchor reading `1 suspected match` / `N suspected matches`,
positioned in the same flex row as the filename and file-size,
after the file-size text and before the delete button. Hidden
entirely when `matchCount === 0 || matchCount === undefined`.
Plain text-link styling at `font-size: 85%`, separated by a middot
at `opacity: 0.4`. Hover/focus is underline-only with a focus ring
on the link's bounding box (no row-level treatment).

**Why:**

- *Inline, not sublabel:* the existing list is a dense
  one-line-per-item rhythm; a sublabel doubles row height and
  breaks the page's cadence.
- *Link, not badge:* a badge reads as "status" and competes with
  the file-size text; a link reads as "go look at the matches",
  which is the intent.
- *Hidden at 0 (and undefined):* day-one state is "match table
  empty"; rendering "0 suspected matches" on every row reads as
  broken. Absence reads as "nothing to see yet". Hiding on
  `undefined` (in-flight on first settings load) avoids a
  "0 → N" flash.

**Alternatives considered:**

- *Always render with disabled state at 0:* Rejected. Visual noise
  with no payoff; the count being zero is the common steady state
  today.
- *Render as a button-shaped pill:* Rejected. Reads as "primary
  action"; the delete button next to it is the primary action.

### Decision 6: Document the naming convention in CLAUDE.md

Add a short "Database naming conventions" block to project
`CLAUDE.md` (and, per the linked design doc, the global
`~/.claude/CLAUDE.md`) documenting:

1. All non-FK columns are prefixed with the table name.
2. FK columns use the exact name of the referenced parent PK
   column.

The reason is NATURAL JOIN safety: same column name = same meaning
across the schema, so NATURAL JOIN composes without surprises.

**Why:** The rule already exists across the schema (see
`packages/back/migrations/sqls/20181027103351-init-up.sql` and
existing `user_notification_audio_sample*` tables) but isn't
documented anywhere. The new table follows the rule by name
(`user_notification_audio_sample_match` with
`user_notification_audio_sample_match_score`, etc.); writing the
rule down now is cheap insurance for future tables.

**Alternatives considered:**

- *Inline comment in the migration file:* Rejected. Migration
  files aren't read for project conventions; future authors won't
  find it.
- *Skip documenting:* Rejected. The rule is load-bearing for the
  search-token implementation (the NATURAL JOIN chain in the
  subquery only works because every column in the path obeys the
  rule). Future tables that violate it would silently break this
  query.

## Risks / Trade-offs

- **[Risk] Migration not applied before backend roll-out** →
  `queryNotificationAudioSamples` would LEFT JOIN against a missing
  relation and the Settings page would 500.
  *Mitigation:* ship the migration with the backend change in the
  same PR; deployment runs migrations before the new code starts
  serving. Front-end behaviour is otherwise additive so a rolled-
  back front-end against the new backend is safe.
- **[Risk] `matchCount` becomes stale between refetches** →
  irrelevant today (no writes) but eventually a user will delete a
  sample or upload a new one without seeing fresh counts.
  *Mitigation:* the existing `updateAudioSamples()` already fires
  on mount, upload, and delete — same staleness profile as the
  rest of Settings. No live updates planned.
- **[Risk] Search-token clause appended in the wrong branch of
  `searchForTracks`** → the parser has a similarity branch and a
  non-similarity branch; pasting the new clause into the wrong
  one would silently no-op for some queries.
  *Mitigation:* the clause is appended next to the existing
  `track:~` handling in the non-similarity branch; tests cover
  co-existence with `track:~`, `artist:`, and `onlyNew=true`.
- **[Risk] Cross-user data leak via tampered `sample:~<id>`** →
  the SQL is the only ownership check.
  *Mitigation:* the NATURAL JOIN on `user_notification_audio_sample`
  combined with `WHERE meta_account_user_id = $userId` makes a
  non-owned ID yield zero matching rows, so the result set is
  empty (no 403, but no leak either). Same posture as
  `track:~<id>`. Tested explicitly.
- **[Risk] Day-one "empty count" looks broken** → users see a
  Settings page identical to today and wonder if the change shipped.
  *Mitigation:* the spec hides the link entirely at `matchCount === 0`,
  so day-one rendering is byte-identical to today. The change is
  invisible until an analyser writer ships, which is the intent.
- **[Risk] Large match sets explode the search page** →
  `matchCount` is unbounded.
  *Mitigation:* the existing search route paginates at 100. Counts
  in practice are expected to be small (curated sample sets, not
  open-ended). Revisit if curated sets grow into the thousands.

## Migration Plan

1. **Ship the migration in the same PR as the backend changes.** The
   up migration creates the table + index; the down migration drops
   the table. The migration runs before the new backend code starts
   serving; rollout order is enforced by the deploy pipeline.
2. **Backend change is additive.** `matchCount: integer >= 0` is a
   new response field; older front-end builds ignore unknown fields.
   The `sample:~<id>` token is only honoured if present in the
   query string — older clients that don't emit it are unaffected.
3. **Front-end change is additive.** The link only renders when
   `matchCount > 0`. On a backend that doesn't return `matchCount`,
   the value is `undefined` and the link is hidden — same posture
   as today.
4. **Naming convention doc is independent.** Adding the
   "Database naming conventions" block to `CLAUDE.md` has no
   runtime impact; it can land in the same PR or a separate one.

**Rollback:**

- Roll back the backend deploy; the front-end keeps working because
  `matchCount` simply disappears and the link stays hidden.
- The migration's down step drops the table cleanly (nothing else
  reads from it on day one). If a future analyser writer ships
  before rollback, the down migration becomes destructive — that
  rollback risk lives with the writer change, not this one.

## Open Questions

- **Frontend test infrastructure for `Settings.js`** — does the
  repo have Jest + RTL set up for these files, or is Settings
  smoke-tested by hand today? Confirm at implementation time; pick
  unit tests or a manual checklist accordingly.
- **Exact copy / spacing for the link** — the design doc proposes
  `▶ filename (TYPE, 1.23MB) · 4 suspected matches · ×`. Final
  styling polish (middot opacity, focus ring, line-height) can be
  tuned during implementation review.
- **Naming convention exact wording** — the draft in the linked
  design doc is a starting point; final wording can be polished
  during PR review.
