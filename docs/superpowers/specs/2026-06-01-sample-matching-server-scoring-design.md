# Sample-matching server-side scoring

## Problem

The analyser worker's interleaved scoring pass
(`analyser/panako_processor.py:run_interleaved_scoring`) currently
writes results to a local file
(`analyser/sample_match_results.jsonl`) instead of the server. Three
things are wrong with this:

1. Scoring output never reaches the production DB, so the existing
   `user_notification_audio_sample_match` table stays empty.
2. The Settings page (`packages/front/src/Settings.js:1466`) shows
   `sample.matchCount` per uploaded audio sample, sourced from a
   `LATERAL COUNT` against that table. Counts are therefore always 0.
3. The `sample:~<id>` search token
   (`packages/back/routes/shared/db/search.js:128`) filters tracks by
   joining the same table — always empty, so the search never returns
   results.

The original transition plan ("populate the table once the persist
endpoint is deployed") stalled because the worker never switched
over. The persistence machinery on the backend (`persistSampleMatches`
in `packages/back/routes/admin/db.js:843`, the per-sample
`POST /admin/exact-match/audio-samples/:sampleId/matches` route in
`packages/back/routes/admin/api.js:283`, the migration that creates
the table at `20260530120000`) is already in code; only the worker
client and the route shape need to change.

## Goal

End-to-end scoring: analyser → server → `user_notification_audio_sample_match`.
Settings page and search token start showing real data as a side
effect, without any frontend change.

Non-goals:

- Rewriting `findExactMatchForSample` or the scoring SQL.
- Changing the migration / table schema.
- Modifying the trigger that fires scoring (the `--score-after N`
  flag inside the preview-fingerprint loop stays as-is).
- Adding any new env vars or frontend routes.

## Approach

### Backend

Add one new admin route:

`POST /api/admin/exact-match/audio-samples/matches`

| Field         | Type      | Default                              | Notes |
|---------------|-----------|--------------------------------------|-------|
| `sample_ids`  | `int[]?`  | omitted → all samples with fingerprints | `[]` returns 400. |
| `threshold`   | `float?`  | `config.sampleMatchDefaultThreshold` | Passed to `findExactMatchForSample`. |

Server behaviour:

1. Resolve sample list. If `sample_ids` is omitted, query
   `queryAudioSamplesWithFingerprint()` (the existing helper). If the
   resolved list is empty, return `200` with empty results
   immediately.
2. Iterate sequentially. The Stage-1 + Stage-2 SQL in
   `findExactMatchForSample` is heavy; concurrent invocations would
   contend on the same fingerprint tables.
3. For each sample, call
   `findExactMatchForSample(sampleId, threshold)` and
   `persistSampleMatches(sampleId, matches, threshold, bucketSeconds)`.
   `persistSampleMatches` already wraps its DELETE+INSERT in one
   transaction, so each sample's write is atomic with respect to
   readers.
4. Per-sample errors are caught, logged at `error`, and recorded in
   the response with `status: "error"`. One bad sample does not
   abort the rest.

Response shape:

```json
{
  "ok_count": 12,
  "fail_count": 1,
  "results": [
    { "sample_id": 42, "status": "ok",    "match_count": 3, "top_score": 87 },
    { "sample_id": 43, "status": "ok",    "match_count": 0, "top_score": null },
    { "sample_id": 44, "status": "error", "error": "..." }
  ]
}
```

`match_count` and `top_score` are the minimum the worker needs to
print the same per-sample log lines it does today. The actual match
arrays are in the DB; they don't need to round-trip.

Removed in the same change (both unused by the frontend; the worker
switchover replaces them):

- `POST /api/admin/exact-match/audio-samples/:sampleId/matches`
  (per-sample persist, never called from anywhere — superseded by
  passing `sample_ids: [n]` to the bulk endpoint).
- `GET /api/admin/exact-match/audio-samples` (sample enumeration,
  only ever called by the worker — superseded by the bulk endpoint
  resolving the list internally).

The per-sample read-only `GET /admin/exact-match/audio-samples/:sampleId/match`
diagnostic stays.

### Analyser worker

`analyser/panako_processor.py` loses:

- `SAMPLE_MATCH_RESULTS_FILE`
- `list_samples_with_fingerprint()`
- `score_sample_via_existing_endpoint()`
- `append_sample_match_result()`
- `run_interleaved_scoring()` (replaced)

Gains one function:

```python
def run_server_side_scoring(reason):
    """POST the bulk-scoring endpoint and log per-sample results."""
```

It POSTs `/admin/exact-match/audio-samples/matches` with no body
(meaning "all samples with fingerprints"), then prints one line per
result mirroring the current log format. A `404` is treated the same
way the current code treats the missing list endpoint — log a clear
message and skip — to handle the brief window before the new route
deploys. The `--score-after N` trigger in the preview loop is
re-pointed at this function. The flag, its default, and the
per-invocation counter semantics do not change.

### Documentation

`analyser/README.md`:

- Drop the "Temporary local storage of results" section and the `jq`
  recipes against `sample_match_results.jsonl`.
- Drop the `GET /admin/exact-match/audio-samples` and per-sample
  scoring endpoint references.
- Replace with a one-paragraph "Results are persisted to
  `user_notification_audio_sample_match` server-side; inspect via
  `fomoplayer query` or the user-facing Settings page after a
  scoring pass".

`.gitignore`:

- Remove the `sample_match_results.jsonl` entry (the file is no
  longer produced). If a local copy exists in someone's checkout,
  document in the change tasks that they can delete it.

### Frontend impact

None — no frontend code change.

The frontend has zero callers of `/admin/exact-match/*` (verified by
grep across `packages/front`, `packages/browser-extension`,
`packages/cli`, `packages/shared`). The two pieces of UI that depend
on match data — Settings.js's `matchCount` and the `sample:~<id>`
search token — read from `user_notification_audio_sample_match` via
the `/me/notifications/audio-samples` and `/api/tracks` routes, which
remain unchanged. They will simply start returning non-zero counts
once the worker has run a scoring pass.

A manual verification step in the change tasks: after the worker has
run one full scoring pass against a non-empty corpus, open the
Settings page and confirm at least one sample shows
"N suspected matches" with a `/search/?q=sample:~<id>` link that
returns rows. This is the user-visible signal that end-to-end
plumbing is live.

## Risks and trade-offs

**Risk: scoring takes a long time during HTTP request.** The bulk
endpoint runs N executions of a multi-CTE SQL sequentially. For N in
the hundreds with default `findExactMatchForSample` timing, the
request can run for minutes. Mitigated by:

- The worker runs inside tmux under `analyse_all.sh`, so blocking on
  one HTTP request is fine — the operator already expects long-running
  workers.
- `requests` default has no read timeout when none is set in the
  worker; we leave it that way intentionally for this call.
- Reverse-proxy timeouts at the deploy boundary may need adjusting if
  the operator points the worker at a hosted environment. Flagged in
  the change's `tasks.md`.

**Risk: partial-failure semantics hide errors.** The worker logs each
per-sample `status: "error"` as a single line and increments
`fail_count`. Operators must read the worker's tmux pane to notice.
Acceptable because the existing flow has the same property (errors
are caught per sample and logged, JSONL is not "all or nothing"
either).

**Risk: removing two routes counts as a breaking API change.** Both
are admin-only and had a single caller (the analyser worker, which is
updated in the same PR). The frontend has none. No external
integrators are documented for these endpoints. The change is safe to
ship as one atomic deploy.

## Testing

Backend:

- New unit test for the bulk endpoint covering: omitted body scores
  all samples; explicit `sample_ids` scores the subset; per-sample
  failure is reported but doesn't abort; empty `sample_ids: []`
  returns 400; threshold override is honoured.
- Adjust the existing test file (if any) that referenced the removed
  per-sample POST route.

Worker:

- The worker change is small and not unit-tested today. Verify
  manually by running `panako_processor.py --previews --batch-size 2000
  --score-after 1 -p false` against a dev backend with a seeded sample,
  inspecting the per-sample log lines and `SELECT * FROM
  user_notification_audio_sample_match LIMIT 10`.

Frontend smoke:

- After the manual worker run, refresh Settings and confirm
  `matchCount` is shown. Click the link, confirm search returns
  the expected previews.

## Out of scope

- A retry / backoff strategy beyond the existing 5s outer worker
  retry loop in `analyse_all.sh`.
- Streaming / progress reporting from the bulk endpoint (would require
  NDJSON or SSE; the current "blocks until done" behaviour is fine).
- Concurrency on the server side. If scoring time becomes a problem,
  the right move is a worker queue, not request concurrency.
- Migrating any existing local `sample_match_results.jsonl` data to
  the DB. Operators are expected to discard the local file.
