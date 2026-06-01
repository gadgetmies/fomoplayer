## 1. Backend: add bulk-scoring endpoint

- [x] 1.1 Add `POST /api/admin/exact-match/audio-samples/matches` in `packages/back/routes/admin/api.js` with the body shape, default-threshold, default-bucket-seconds, and best-effort iteration semantics from `specs/sample-matching/spec.md`.
- [x] 1.2 Reuse the existing `findExactMatchForSample` and `persistSampleMatches` helpers in `packages/back/routes/admin/db.js` — no SQL changes.
- [x] 1.3 Resolve the sample list via `queryAudioSamplesWithFingerprint` when `sample_ids` is omitted; return `400` for `sample_ids: []`.
- [x] 1.4 Per-sample try/catch: log `error` server-side via the shared logger, record `{ status: "error", error: e.message }`, continue to next sample.
- [x] 1.5 Build the response: `{ ok_count, fail_count, results: [...] }`, with `top_score` from the first match row or `null`.

## 2. Backend: remove deprecated routes

- [x] 2.1 Remove `POST /api/admin/exact-match/audio-samples/:sampleId/matches` from `packages/back/routes/admin/api.js`.
- [x] 2.2 Remove `GET /api/admin/exact-match/audio-samples` from the same file.
- [x] 2.3 Confirm no other code path imports or references the removed routes (grep `packages/back`, `packages/front`, `packages/browser-extension`, `packages/cli`, `packages/shared`).
- [x] 2.4 Leave `queryAudioSamplesWithFingerprint` exported (still used by the bulk endpoint internally) and leave `persistSampleMatches` unchanged.

## 3. Backend tests

- [x] 3.1 Add a test file (e.g. `packages/back/test/tests/admin/sample-matching-bulk-scoring.js`) covering: omitted body scores all samples; explicit `sample_ids` scores subset; empty array returns 400; threshold override is honoured; one bad sample yields `status: "error"` while others succeed; rows land in `user_notification_audio_sample_match` with correct `threshold` and `bucket_seconds` columns.
- [x] 3.2 Delete or rewrite any existing test that referenced the removed per-sample POST route or the removed GET list endpoint.
- [ ] 3.3 Run the full backend test suite: `cd packages/back && npm test` — confirm it passes.

## 4. Analyser worker switchover

- [x] 4.1 Remove `SAMPLE_MATCH_RESULTS_FILE`, `list_samples_with_fingerprint`, `score_sample_via_existing_endpoint`, `append_sample_match_result`, and `run_interleaved_scoring` from `analyser/panako_processor.py`.
- [x] 4.2 Add `run_server_side_scoring(reason)` that POSTs `${API_URL}/admin/exact-match/audio-samples/matches` with no body, parses the response, prints one per-sample log line matching the current format (`[scoring]   sample <id> (<filename>): <n> match(es)[, top score=<x>]`), and handles a `404` by logging and returning.
- [x] 4.3 Repoint the `--score-after N` block in the previews loop to call `run_server_side_scoring`.
- [x] 4.4 Verify no other call sites of the removed helpers remain (grep `analyser/`).

## 5. Documentation & gitignore

- [x] 5.1 In `analyser/README.md`, remove the "Temporary local storage of results" section and the `jq` recipes against `sample_match_results.jsonl`.
- [x] 5.2 Remove the bullets referencing `GET /admin/exact-match/audio-samples` and the per-sample persist endpoint from the same README section.
- [x] 5.3 Replace with a short paragraph: "Results are persisted to `user_notification_audio_sample_match` server-side; inspect via `fomoplayer query` or the user-facing Settings page after a scoring pass."
- [x] 5.4 Remove the `sample_match_results.jsonl` entry from `.gitignore` if present.

## 6. Manual end-to-end verification

- [ ] 6.1 Apply backend migration if needed (table already exists in dev; re-confirm).
- [ ] 6.2 Run the analyser against a dev backend with at least one seeded sample that has fingerprints and at least one preview that should match: `python analyser/panako_processor.py --previews --batch-size 2000 --score-after 1`.
- [ ] 6.3 Inspect the worker's tmux pane — confirm one log line per sample with non-zero `match_count` for the seeded match.
- [ ] 6.4 Inspect the DB: `SELECT user_notification_audio_sample_id, store__track_preview_id, user_notification_audio_sample_match_score FROM user_notification_audio_sample_match LIMIT 20;` — confirm rows exist with the expected `threshold` and `bucket_seconds`.
- [ ] 6.5 Open the Settings page in the frontend, log in as a user whose audio sample matched. Confirm `matchCount` shows non-zero next to the sample.
- [ ] 6.6 Click the sample's `/search/?q=sample:~<id>` link. Confirm the search returns the expected previews.

## 7. Operational follow-up

- [ ] 7.1 If pointing the worker at a hosted environment (not localhost), confirm the reverse-proxy read timeout is wide enough to cover a worst-case scoring pass (sequential SQL across all samples). Widen if necessary.
- [ ] 7.2 Inform operators: any local `analyser/sample_match_results.jsonl` files in existing checkouts are obsolete and can be deleted.
