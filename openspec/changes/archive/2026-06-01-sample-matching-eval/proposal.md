## Why

The sample-matching pipeline (`packages/back/routes/admin/db.js:622-753`) is
tuned against the six hermetic fixtures in `analyser/data/` and the
regression test in `packages/back/test/tests/admin/sample-matching-regression.js`.
That covers correctness on a frozen tiny set but does not measure how the
matcher performs against real production samples, and gives no way to sweep
`SAMPLE_MATCH_DEFAULT_THRESHOLD` / `SAMPLE_MATCH_BUCKET_SECONDS` against a
realistic dataset before deploying a config change. Operators currently
have to guess at parameter changes and hope the hermetic regression test
still represents production behaviour.

## What Changes

- Add a new `sample_match_eval_pair` table in prod that stores the curated
  known-correct sample→preview mapping (1-to-1 or 1-to-many) used by the
  eval. No application code reads from it.
- Add a Python evaluation harness under `analyser/eval/` that, given the
  curated pair list, downloads the audio, extracts fingerprints locally,
  scores each sample against (expected previews + K random distractors)
  across a `threshold × bucket_seconds` parameter grid, and emits a
  per-pair CSV plus a console summary (top-1 / top-5 accuracy, recall,
  false-positive rate).
- Refactor the existing extraction helpers (`download_and_manage_file`,
  `ensure_downloads_directory`, `compute_file_hash`,
  `extract_panako_fingerprints`) out of `analyser/panako_processor.py`
  into a new shared module `analyser/extraction.py`, so the eval and the
  production analyser share one extraction code path. `panako_processor.py`
  re-exports them for backwards compatibility.
- Port the production two-stage matcher (`db.js:622-753`) to a pure-Python
  scorer (`analyser/eval/scorer.py`) so parameter sweeps don't require a
  running backend. A manually-run parity test compares the port against
  the existing `GET /api/admin/exact-match/diagnostics` endpoint to catch
  drift.
- Use the existing `fomoplayer query` CLI for all DB access. No new
  backend HTTP routes, no changes to the matcher.

## Capabilities

### New Capabilities

- `sample-matching-eval`: A manual investigation tool that re-extracts and
  re-scores curated production sample→preview pairs across a parameter
  grid, with an opt-in extraction cache, and reports accuracy and
  false-positive metrics so operators can tune the production matcher
  config before deploying.

### Modified Capabilities

(none — `sample-matching` itself is unchanged; the eval only reads
production data and runs a pure-Python port of the existing scorer.)

## Impact

- **New table**: `sample_match_eval_pair` (FKs to
  `user_notification_audio_sample` and `store__track_preview`,
  `ON DELETE CASCADE`). One up/down migration in
  `packages/back/migrations/sqls/`. Read-only from the application's
  perspective.
- **New Python package**: `analyser/eval/` containing `scorer.py`,
  `extraction.py`, `sweep.py`, `test_scorer.py`, and a `README.md`
  documenting the chosen grid and cache invalidation policy.
- **Refactor**: `analyser/panako_processor.py` loses the four extraction
  helpers (they move to `analyser/extraction.py`) but re-exports them so
  existing imports continue to work.
- **Tooling dependency**: The eval invokes `fomoplayer` (the CLI in
  `packages/cli/`) as a subprocess for all DB access. The operator must
  have run `fomoplayer login` against the target environment before
  running the sweep.
- **Production data**: Read-only. The eval reads
  `sample_match_eval_pair`, `user_notification_audio_sample`, and
  `store__track_preview` via `fomoplayer query`. It does not write to
  prod and does not touch the matcher.
- **CI**: The pure-Python scorer unit tests run in CI (mirroring the
  hermetic regression test). The parity test against the prod diagnostics
  endpoint is manual — it requires credentials and a backend pointed at
  prod data, so it stays out of CI.
- **No new HTTP routes, no new env vars in `packages/back`.** The eval's
  parity test reads canned pair IDs from `EVAL_PARITY_PAIRS` at run time.
