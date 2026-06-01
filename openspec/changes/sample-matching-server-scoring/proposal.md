## Why

The analyser's interleaved scoring pass writes results to a local file
(`analyser/sample_match_results.jsonl`) instead of the server, so the
`user_notification_audio_sample_match` table — already created by
migration `20260530120000` and already read by the Settings page and
the `sample:~<id>` search token — stays empty. Match counts are
always `0` and sample-scoped search always returns nothing. The
backend persistence helper and a per-sample persist route already
exist in code; the change to make them load-bearing has stalled at the
worker.

## What Changes

- Add `POST /api/admin/exact-match/audio-samples/matches` — a bulk
  endpoint that scores one, many, or all samples (when `sample_ids`
  is omitted) and persists each sample's matches via the existing
  `persistSampleMatches` helper. Best-effort per-sample iteration
  (one failure does not abort the rest). Response shape is
  `{ ok_count, fail_count, results: [{ sample_id, status,
  match_count?, top_score?, error? }] }`. Server-side iteration is
  sequential.
- **BREAKING** Remove `POST /api/admin/exact-match/audio-samples/:sampleId/matches`.
  The new bulk endpoint covers the single-sample case via
  `sample_ids: [n]`. No frontend caller exists.
- **BREAKING** Remove `GET /api/admin/exact-match/audio-samples`
  (worker-only sample enumeration). The bulk endpoint resolves the
  list internally. No frontend caller exists.
- Switch `analyser/panako_processor.py` from the GET-then-local-JSONL
  scoring pass to one POST against the new bulk endpoint. Drop
  `SAMPLE_MATCH_RESULTS_FILE`, `list_samples_with_fingerprint`,
  `score_sample_via_existing_endpoint`,
  `append_sample_match_result`, and `run_interleaved_scoring`. Add
  `run_server_side_scoring(reason)`. The `--score-after N` trigger
  and per-invocation counter semantics are unchanged.
- Update `analyser/README.md`: remove the "Temporary local storage of
  results" section, the `jq` recipes against the JSONL file, and the
  references to the two removed endpoints. Replace with a pointer to
  `user_notification_audio_sample_match` and the Settings page as the
  inspection surface.
- Update `.gitignore` to drop the now-unproduced
  `sample_match_results.jsonl` entry.

## Capabilities

### New Capabilities

(none — the persist endpoint is added under the existing
`sample-matching` capability.)

### Modified Capabilities

- `sample-matching`: add requirements for the bulk server-side
  scoring endpoint and the analyser worker's use of it. The existing
  requirements (`findExactMatchForSample`, diagnostics endpoint,
  threshold-from-config, fixture pairs, two-stage matcher) are not
  altered.

## Impact

- **New backend route**: `POST /api/admin/exact-match/audio-samples/matches`
  in `packages/back/routes/admin/api.js`. Wraps the existing
  `findExactMatchForSample` and `persistSampleMatches` helpers; no
  new SQL.
- **Removed backend routes**: per-sample
  `POST /api/admin/exact-match/audio-samples/:sampleId/matches` and
  `GET /api/admin/exact-match/audio-samples`. Both are admin-only,
  unused by the frontend, and the worker switches over in the same
  PR.
- **Analyser worker rewrite**: `analyser/panako_processor.py` scoring
  helpers replaced by one function that POSTs the bulk endpoint.
- **Documentation**: `analyser/README.md` loses one section, gains a
  pointer to the server-side store.
- **Frontend**: no code change. `Settings.js`'s `matchCount` and the
  `sample:~<id>` search token already read the match table; they
  will start showing non-zero counts as a side effect once the
  worker populates it.
- **Migrations**: none. Table already exists.
- **Config / env**: no new variables. Uses existing
  `sampleMatchDefaultThreshold` and `sampleMatchBucketSeconds`.
- **Tests**: new backend test for the bulk endpoint; remove or
  rewrite any test referencing the removed per-sample POST route.
- **Operational**: long-running HTTP request. Operators pointing the
  worker at a hosted environment may need to widen reverse-proxy
  read timeouts. Flagged in `tasks.md`.
