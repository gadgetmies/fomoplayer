# Suspected-sample-matches: display + search-route design

## Why

The exact-match scorer (`packages/back/routes/admin/db.js:findExactMatchForSample`)
identifies store previews that match a user-uploaded notification audio
sample. Today nothing in the user-facing UI surfaces those matches — the
scorer is reachable only via admin endpoints. This change adds the
display layer and the data shape needed for it: a "**N suspected
matches**" affordance on each audio-sample row in Settings, and a
`sample:~<id>` search-token that lists the matched tracks via the
existing search results page.

The analyser-side write path that populates the matches is **out of
scope**. The table ships empty and surfaces nothing in the UI until
something starts writing to it — that wiring is a separate change.

## Scope

### In scope

- New `user_notification_audio_sample_match` table (storage for the
  per-sample → per-preview match set, with score + scoring-config
  columns so we can record what config produced each row).
- Extend `GET /me/notifications/audio-samples` so each sample row
  carries `matchCount`.
- New `sample:~<sample_id>` token in the shared track-search parser
  (`packages/back/routes/shared/db/search.js`), gated on sample
  ownership.
- Settings UI: link reading "N suspected matches" inside each audio
  sample list item, click-routes to `sample:~<id>` search.
- Add the project-wide and user-global rule "all DB columns are
  table-prefixed; FK columns mirror the parent PK column name; reason
  is NATURAL JOIN compatibility" to both project `CLAUDE.md` and
  `~/.claude/CLAUDE.md`.

### Out of scope

- Wiring the analyser (or any other process) to write into
  `user_notification_audio_sample_match`. The table is empty on day
  one.
- A dedicated "matches" page. The existing search results UI is
  reused via the new search token.
- Admin endpoints / `fomoplayer query` policies for the new table.
  All read paths already join through `user_notification_audio_sample`
  which is gated by `meta_account_user_id`.

## Architecture

Two existing-infrastructure additions, no new HTTP routes, no new
frontend page.

1. **Read path (settings count display).** The current
   `GET /me/notifications/audio-samples` (`packages/back/routes/users/api.js:471`,
   backed by `queryNotificationAudioSamples` at `packages/back/routes/users/db.js:1480`)
   is extended to return one extra field per sample, `matchCount`,
   produced by a LATERAL `COUNT(*)` subquery against the new table.
   The Settings list-item renders the count + link.
2. **Search-filter path (list matches).**
   `packages/back/routes/shared/db/search.js:searchForTracks` learns
   one new token, `sample:~<sample_id>`, with the same regex shape as
   the existing `track:~<track_id>`. When present, the existing
   track-id subquery is constrained to tracks that have a preview in
   the match table for the named sample, scoped to the calling user
   via NATURAL JOIN through `user_notification_audio_sample`. The
   front-end's `App.js:search()` is invoked with
   `q=sample:~<id>` from the settings link; the existing search-page
   UI renders the rows.

## Database

### New table

```sql
CREATE TABLE user_notification_audio_sample_match
(
    user_notification_audio_sample_id                       INTEGER     NOT NULL
        REFERENCES user_notification_audio_sample (user_notification_audio_sample_id) ON DELETE CASCADE,
    store__track_preview_id                                 INTEGER     NOT NULL
        REFERENCES store__track_preview (store__track_preview_id) ON DELETE CASCADE,
    user_notification_audio_sample_match_score              INTEGER     NOT NULL,
    user_notification_audio_sample_match_threshold          FLOAT       NOT NULL,
    user_notification_audio_sample_match_bucket_seconds     FLOAT       NOT NULL,
    user_notification_audio_sample_match_matched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_notification_audio_sample_id, store__track_preview_id)
);

CREATE INDEX idx_user_notification_audio_sample_match_sample
    ON user_notification_audio_sample_match (user_notification_audio_sample_id);
```

Column-naming rules followed exactly:

- Every non-FK column is prefixed with the table name
  (`user_notification_audio_sample_match_*`).
- FK columns use the *exact* name of the referenced parent PK column
  (`user_notification_audio_sample_id`, `store__track_preview_id`),
  so `NATURAL JOIN user_notification_audio_sample` and
  `NATURAL JOIN store__track_preview` resolve cleanly.
- Composite PK on the two FKs prevents duplicate (sample, preview)
  pairs; the extra index on `user_notification_audio_sample_id`
  supports the per-sample count and the search-filter join.

### Migration

`packages/back/migrations/sqls/<timestamp>-add-user-notification-audio-sample-match-up.sql`
contains the CREATE TABLE + index above.
`<timestamp>-add-user-notification-audio-sample-match-down.sql` is
`DROP TABLE IF EXISTS user_notification_audio_sample_match;`. A
matching `<timestamp>-add-user-notification-audio-sample-match.js`
driver follows the existing repo pattern (see
`packages/back/migrations/20260104141157-add-notification-audio-samples.js`).

## Backend

### `queryNotificationAudioSamples` extension

`packages/back/routes/users/db.js:1480` is amended to LEFT JOIN
LATERAL a per-sample COUNT(*) of the match table:

```sql
SELECT
  uns.user_notification_audio_sample_id          AS id,
  uns.user_notification_audio_sample_url         AS url,
  uns.user_notification_audio_sample_object_key  AS "objectKey",
  uns.user_notification_audio_sample_file_size   AS "fileSize",
  uns.user_notification_audio_sample_file_type   AS "fileType",
  uns.user_notification_audio_sample_filename    AS filename,
  uns.user_notification_audio_sample_created_at  AS "createdAt",
  c.user_notification_audio_sample_match_count   AS "matchCount"
FROM user_notification_audio_sample uns
LEFT JOIN LATERAL (
  SELECT COUNT(*)::INT AS user_notification_audio_sample_match_count
  FROM user_notification_audio_sample_match m
  WHERE m.user_notification_audio_sample_id = uns.user_notification_audio_sample_id
) c ON TRUE
WHERE uns.meta_account_user_id = $userId
ORDER BY uns.user_notification_audio_sample_created_at DESC;
```

API response gains one additive field (`matchCount: integer >= 0`).
No breaking change — existing settings UI ignores unknown fields, so
a rolled-back front-end against the new backend keeps working.

### Search parser extension

`packages/back/routes/shared/db/search.js` adds, alongside the existing
`similaritySearchTrackId` parse at line 22:

```js
const sampleMatchSearchSampleId =
  originalQueryString.match(/sample:~(\d+)/)?.[1]
```

When non-null, the existing track-id subquery in the non-similarity
branch (line ~230 onwards) gets an additional `AND track_id IN (…)`
clause:

```sql
AND track_id IN (
  SELECT track_id
  FROM user_notification_audio_sample_match m
    NATURAL JOIN store__track_preview
    NATURAL JOIN store__track
    NATURAL JOIN user_notification_audio_sample uns
  WHERE m.user_notification_audio_sample_id = ${sampleMatchSearchSampleId}
    AND uns.meta_account_user_id = ${userId}
)
```

The NATURAL JOIN on `user_notification_audio_sample` enforces
ownership: if the named sample isn't owned by the calling user, the
join produces zero rows and the filter returns the empty set. No new
auth check at the route level — the SQL is the boundary.

When no explicit sort parameter is passed (default
`sort=-released`), `sample:~` searches override to
`ORDER BY MAX(user_notification_audio_sample_match_score) DESC`
so the strongest matches surface first. An explicit `sort=…`
parameter wins as today.

Co-existence with other tokens (`sample:~5 artist:42`,
`sample:~5 onlyNew=true`) is mechanical AND-of-filters — the new
clause is appended to the same subquery the other filters extend.

### No new HTTP routes

Both reads piggyback on existing endpoints:

- Count: `GET /me/notifications/audio-samples` (extended).
- List: `GET /me/tracks?q=sample:~<id>` (existing search route,
  extended parser).

## Frontend

### Settings list item (one line of new render code)

`packages/front/src/Settings.js:1418-1510` — inside the existing
`<li>` for each sample, after the file-size text and before the
delete button, render:

```jsx
{sample.matchCount > 0 && (
  <a
    onClick={(e) => {
      e.stopPropagation()
      this.props.search({ q: `sample:~${sample.id}` })
    }}
    style={{ fontSize: '85%', cursor: 'pointer' }}
  >
    {sample.matchCount === 1
      ? '1 suspected match'
      : `${sample.matchCount} suspected matches`}
  </a>
)}
```

(Final styling — including the leading middot separator,
text-decoration, focus ring — follows Section C of the design.
Code shown here is structural, not literal.)

### `search` prop wiring

`this.props.search` already exists on the Settings component — the
existing search affordances (e.g. clicking a follow entity to filter)
use it. No new prop, no new routing.

### Visual spec (paste-ready)

The "suspected matches" affordance lives inline in the same flex row
as the filename and file-size, placed **after** the file-size text
and **before** the delete `×`-button, so the reading order is
`▶ filename (TYPE, 1.23MB) · 4 suspected matches · ×`. Render it as
an anchor (not a badge): plain text-link styling, inheriting body
color, with a middot separator at `opacity: 0.4` and `font-size:
85%` to match the existing file-size text — actionable but not
louder than the row's primary content. Copy follows simple
pluralisation: `0` → element hidden entirely (no "0 matches"
disabled state), `1` → `1 suspected match`, `N` → `N suspected
matches`; while `matchCount === undefined` (in-flight on first
settings load) the element is omitted rather than flashing through
"0" → "N". Hover/focus is underline-only (no row-level treatment);
the link receives a focus ring on its own bounding box, the row does
not. Stale-state cue is deferred — the per-match
`user_notification_audio_sample_match_matched_at` column doesn't
answer "when was this sample last scanned" (it answers "when was
this match recorded"); a stale cue would need a per-sample
`*_last_scanned_at` column on `user_notification_audio_sample`,
which is out of scope here.

Rationale (not in the spec, but worth recording):

- **Hidden at 0** because most rows on most users will be 0 until
  the analyser is wired; a row of repeated "0 suspected matches"
  reads as broken, while absence reads as "nothing to see yet".
- **Link, not a badge**, because badges read as status and compete
  with the file-size text; a link reads as "go look at the matches".
- **Inline, not sublabel**, because the existing settings page is a
  dense one-line-per-item rhythm; a sublabel would double row height
  and break the page's cadence.

## Naming-convention documentation

### Project `CLAUDE.md` (this repo)

Add a "Database naming conventions" block:

```
# Database naming conventions

All new tables and columns follow two rules:

1. **Table-prefixed column names.** Every column on table `foo_bar`
   starts with `foo_bar_`. The exception is foreign-key columns —
   see rule 2.

2. **FK columns use the exact name of the referenced parent PK
   column.** E.g. a table that references
   `user_notification_audio_sample` has a column named
   `user_notification_audio_sample_id`, not
   `<this_table>_user_notification_audio_sample_id`.

The point of both rules is to keep `NATURAL JOIN` safe across the
schema: shared column names mean the same thing wherever they
appear, and the join syntax stays compact and readable. See
`packages/back/migrations/sqls/20181027103351-init-up.sql` and the
existing `user_notification_audio_sample*` tables for canonical
examples.
```

### Global `~/.claude/CLAUDE.md`

Same block, lightly generalised (drops the repo-specific file
pointer). This ensures the convention is the default in any
project that uses Postgres + NATURAL JOIN.

## Data flow

### Settings page mount

1. Browser loads `/settings/notifications`, mounts `Settings`,
   `componentDidMount` calls `this.updateAudioSamples()`.
2. `GET /api/me/notifications/audio-samples` resolves with one row
   per sample, each carrying `matchCount`.
3. `setState({ audioSamples })` triggers the list render. Per row,
   if `matchCount > 0` the spec'd link appears.

### User clicks "N suspected matches"

1. `onClick` calls `this.props.search({ q: \`sample:~${sample.id}\` })`.
2. `App.js:search()` does `window.history.pushState('/search?q=sample:~123')`
   and `GET /api/me/tracks?q=sample:~123`.
3. Backend `searchForTracks` matches `/sample:~(\d+)/`, builds the
   ownership-scoped subquery, returns tracks ordered by max
   match_score (or the explicit sort).
4. Front-end renders the response in the existing tracks list view.

### Write path (out of scope, recorded)

```
analyser → INSERT INTO user_notification_audio_sample_match
            (user_notification_audio_sample_id, store__track_preview_id,
             user_notification_audio_sample_match_score,
             user_notification_audio_sample_match_threshold,
             user_notification_audio_sample_match_bucket_seconds)
           VALUES (...)
           ON CONFLICT (user_notification_audio_sample_id, store__track_preview_id)
           DO UPDATE SET ...
```

## Error handling

| Failure | Behaviour |
| --- | --- |
| Table empty (day-one state) | `matchCount = 0` everywhere → spec hides the link → identical UI to today. |
| Migration not applied | `queryNotificationAudioSamples` LEFT JOIN against a missing relation throws → settings page 500s. Mitigation: ship the migration with the backend change. The response shape is additive, so rolled-back front-end against new backend is safe. |
| Stale `matchCount` | Today: irrelevant (no writes). When writes ship: the page refetches on mount and after upload/delete (existing `updateAudioSamples` calls); no live updates, same staleness profile as the rest of Settings. |
| Sample deleted between render and click | `sample:~<id>` join finds no `user_notification_audio_sample` row → empty search result. ON DELETE CASCADE removes match rows. No orphans. |
| URL-tampered `sample:~<id>` for another user's sample | Ownership join produces zero rows → empty result. Same posture as the existing `track:~<id>` (no 403, just empty). |
| Malformed `sample:~abc` | Regex doesn't match → token treated as free text, same fallback the existing parser uses for malformed `track:~`. |
| Large match sets | Counts are unbounded but small in practice; search page paginates at 100. Revisit if curated sets grow. |

## Testing

| Layer | Approach |
| --- | --- |
| Migration | Apply up, assert composite PK + both FKs + cascade behaviour against `user_notification_audio_sample_embedding`-style integration test (insert row → delete parent sample → match row gone). Apply down, assert table dropped. |
| `queryNotificationAudioSamples` | Extend existing audio-samples endpoint test. Assert `matchCount: 0` with empty table; `matchCount: N` after N inserts; cross-user isolation. |
| `searchForTracks` `sample:~<id>` | Add test cases: valid → expected track set; non-owner → empty; non-existent sample → empty; malformed token → free-text fallback; default sort = `MAX(match_score) DESC`; explicit sort overrides; co-existence with `artist:` / `onlyNew`. |
| Settings list item | If frontend test infra exists: assert `undefined` → no link; `0` → no link; `1` → "1 suspected match"; `>1` → "N suspected matches"; click invokes `props.search({ q: 'sample:~<id>' })`. Else: manual-test checklist in the PR. |
| E2E | Skipped — integration + unit cover the wire. |

## Open questions

- Frontend test infrastructure for `Settings.js`: does the repo have
  Jest + RTL set up for these files, or are Settings changes
  smoke-tested by hand today? Confirm during implementation; adapt
  the testing approach for that layer accordingly.
- The naming-convention text above is a draft — exact wording can
  be polished during implementation.
