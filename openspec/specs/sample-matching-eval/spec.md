## Purpose

Provide an offline, Python-only evaluation harness for sample→preview
matching: a curated `sample_match_eval_pair` table holds labelled pairs, a
shared extraction module wraps Panako fingerprint extraction (with an opt-in
file-hash + CLI-args cache), a pure-Python two-stage scorer mirrors the
production scorer, and a sweep CLI produces per-pair CSV results and
accuracy/recall/false-positive summaries over a parameter grid. A manual
parity test compares the Python scorer against the backend diagnostics
endpoint so the eval is trusted before being relied on.

## Requirements

### Requirement: `sample_match_eval_pair` table MUST store curated sample→preview pairs with FK integrity

The system SHALL provide a `sample_match_eval_pair` table with the
following shape:

- `user_notification_audio_sample_id` INTEGER NOT NULL,
  referencing
  `user_notification_audio_sample(user_notification_audio_sample_id)`,
  `ON DELETE CASCADE`.
- `store__track_preview_id` INTEGER NOT NULL, referencing
  `store__track_preview(store__track_preview_id)`,
  `ON DELETE CASCADE`.
- `sample_match_eval_pair_notes` TEXT, nullable.
- PRIMARY KEY (`user_notification_audio_sample_id`,
  `store__track_preview_id`).

The migration MUST ship as a forward (`-up.sql`) and backward
(`-down.sql`) pair under `packages/back/migrations/sqls/`. The
`-down.sql` MUST drop the table.

No application code (no HTTP route, no scheduled job, no admin UI)
SHALL read from or write to this table. Reads are exclusively done by
the Python eval via `fomoplayer query`.

#### Scenario: Migration up creates the table with the documented columns and constraints

- **WHEN** the `-up.sql` migration is applied to a clean database
- **THEN** the `sample_match_eval_pair` table exists with the four
  columns above, the composite primary key, and both FKs with
  `ON DELETE CASCADE`

#### Scenario: Deleting a referenced sample cascades to its eval pairs

- **WHEN** a row in `user_notification_audio_sample` is deleted that
  is referenced by one or more `sample_match_eval_pair` rows
- **THEN** the referencing `sample_match_eval_pair` rows are
  automatically removed by the database

#### Scenario: Migration down drops the table

- **WHEN** the `-down.sql` migration is applied
- **THEN** the `sample_match_eval_pair` table no longer exists in the
  schema

### Requirement: Extraction helpers MUST live in a shared module reusable by the eval

The four extraction helpers — `download_and_manage_file`,
`ensure_downloads_directory`, `compute_file_hash`, and
`extract_panako_fingerprints` — SHALL be defined in
`analyser/extraction.py`. `analyser/panako_processor.py` SHALL
re-export them so existing imports continue to resolve.

The eval's `analyser/eval/extraction.py` MUST import these helpers
from `analyser.extraction`, not from `panako_processor.py`, so the
eval does not load the production worker's module-level state.

#### Scenario: panako_processor.py still exposes the helpers

- **WHEN** existing code imports
  `download_and_manage_file`, `ensure_downloads_directory`,
  `compute_file_hash`, or `extract_panako_fingerprints` from
  `analyser.panako_processor`
- **THEN** the import succeeds and the function executes with the
  same behaviour as before the refactor

#### Scenario: Eval imports extraction helpers from analyser.extraction

- **WHEN** `analyser/eval/extraction.py` is imported
- **THEN** it imports the four helpers from `analyser.extraction`
  and does NOT import `analyser.panako_processor`

### Requirement: `analyser/eval/scorer.py` MUST implement the two-stage matcher as pure functions

The system SHALL provide a pure-Python module `analyser/eval/scorer.py`
exposing two functions:

- `stage1_filter(sample_hashes, candidate_hashes_by_id, threshold) ->
  list[int]` — returns the candidate IDs whose
  `len(sample_hashes & candidate_hashes) / len(sample_hashes)` is
  greater than or equal to `threshold`.
- `stage2_score(sample_fingerprints, preview_fingerprints,
  bucket_seconds, seconds_per_block=128/16000) -> int` — given two
  lists of `(hash, t1)` tuples, computes the cross-join on shared
  hashes, derives `Δt = preview_t1 − sample_t1` in seconds, buckets
  by `bucket_seconds`, and returns the count of the peak bucket.

Both functions MUST be pure (no I/O, no globals) so they can be
unit-tested on hand-built fingerprint dicts.

#### Scenario: stage1_filter returns only candidates above the threshold

- **WHEN** `stage1_filter({1,2,3,4}, {10: {1,2}, 20: {1,2,3}}, 0.5)`
  is called
- **THEN** the result is `[20]` because candidate `10` has overlap
  `2/4 = 0.5` (equal to threshold, included) and candidate `20` has
  overlap `3/4 = 0.75` — actually both pass; the test fixture in the
  implementation MUST verify both inclusive-boundary and
  exclusion behaviour

#### Scenario: stage2_score returns the peak Δt bucket count

- **WHEN** sample fingerprints `[(h1,0),(h2,10),(h3,20)]` and
  preview fingerprints `[(h1,5),(h2,15),(h3,30)]` are scored at
  `bucket_seconds=0.1` and the default `seconds_per_block`
- **THEN** `stage2_score` returns the count of the dominant
  `Δt` bucket (which, given the synthetic data above where two of
  three matches share the same `Δt`, is `2`)

#### Scenario: stage2_score returns 0 when there are no shared hashes

- **WHEN** sample and preview fingerprint lists share no hashes
- **THEN** `stage2_score` returns `0`

### Requirement: `analyser/eval/extraction.py` MUST wrap the shared helpers with an opt-in cache keyed by file SHA256 and panako config

The system SHALL provide
`analyser/eval/extraction.py:extract(audio_url, cache_dir=None) ->
list[tuple[int, int]]` which downloads the URL, converts MP3→WAV if
needed, runs panako, and returns the extracted `(hash, t1)`
fingerprints.

When `cache_dir` is set, the cache key MUST be the SHA256 of the
downloaded audio file PLUS a stable hash of the panako command-line
arguments used for extraction. Cache entries SHALL live as JSON
files at `<cache_dir>/<key>.json`.

When `cache_dir` is not set (the CLI default), extraction MUST run
end-to-end every call.

#### Scenario: Repeated extract calls with caching enabled hit the cache on the second call

- **WHEN** `extract(url, cache_dir=DIR)` is called twice for the
  same `url` with no change to the panako command-line args
- **THEN** the second call returns the same fingerprints as the
  first and does NOT invoke panako again

#### Scenario: Changing panako command-line args invalidates the cache

- **WHEN** `extract(url, cache_dir=DIR)` is called once, then the
  panako command-line args change, then `extract(url, cache_dir=DIR)`
  is called again with the same `url`
- **THEN** the second call re-runs panako (cache miss) because the
  cache key incorporates the panako command-line args

#### Scenario: Default (uncached) mode re-runs panako every call

- **WHEN** `extract(url)` is called twice for the same `url` with
  no `cache_dir`
- **THEN** panako runs twice (no cache hit)

### Requirement: `analyser/eval/sweep.py` MUST orchestrate the eval over a parameter grid and emit a per-pair CSV plus a console summary

The system SHALL provide a CLI entry point `analyser/eval/sweep.py`
accepting the following arguments:

- `--thresholds` (comma-separated floats; default
  `0.005,0.008,0.01,0.02,0.05`).
- `--bucket-seconds` (comma-separated floats; default `0.05,0.1`).
- `--distractors` (integer; default `20`).
- `--seed` (integer; default `42`).
- `--cache-extractions` (flag; default off).
- `--out` (path to the output CSV; required).

For each `(threshold, bucket_seconds)` grid cell, the script SHALL
score every sample in `sample_match_eval_pair` against the union of
its expected previews and `--distractors` deterministically-selected
distractor previews (per Decision 6 of `design.md`).

The output CSV MUST contain one row per
`(sample_id, candidate_id, threshold, bucket_seconds)` with at
least the columns `sample_id`, `candidate_id`, `is_expected`,
`threshold`, `bucket_seconds`, `stage1_passed`, `stage2_score`,
`rank_among_candidates`, and `extraction_failed`.

The console summary MUST report, per
`(threshold, bucket_seconds)` cell: top-1 accuracy (% samples whose
top-ranked candidate is an expected preview), top-5 accuracy,
recall (% expected pairs that pass Stage 1 AND have non-zero Stage 2
score), and false-positive rate (% samples where any distractor
outranks all expected previews).

All DB access MUST go through `fomoplayer query` invoked as a
subprocess. The script MUST NOT open direct DB connections and MUST
NOT add any new HTTP routes.

#### Scenario: Default invocation runs the documented grid and emits a CSV

- **WHEN** `python analyser/eval/sweep.py --out results.csv` is
  run against a populated `sample_match_eval_pair`
- **THEN** the script evaluates every grid cell in the documented
  default grid, writes one row per
  `(sample_id, candidate_id, threshold, bucket_seconds)` to
  `results.csv`, and prints a summary table covering top-1
  accuracy, top-5 accuracy, recall, and false-positive rate per
  cell

#### Scenario: Distractor selection is deterministic given the same seed and prod catalog

- **WHEN** `sweep.py` is run twice with the same `--seed` against
  the same prod catalog state, both times with
  `--cache-extractions` enabled
- **THEN** both runs select the same distractor preview IDs for
  each sample

#### Scenario: Extraction failure on one file does not abort the run

- **WHEN** the download or panako extraction for one preview URL
  fails during a sweep
- **THEN** the script logs the URL and error, marks the affected
  rows in the CSV with `extraction_failed=true`, and continues
  processing the remaining samples and candidates

#### Scenario: Empty pair table exits zero with a message

- **WHEN** `sample_match_eval_pair` contains zero rows and
  `sweep.py` is run
- **THEN** the script prints "no pairs to evaluate; insert rows
  into sample_match_eval_pair" and exits with status `0`

#### Scenario: Missing pair table exits non-zero with a migration pointer

- **WHEN** `sample_match_eval_pair` does not exist (migration not
  applied) and `sweep.py` is run
- **THEN** the script exits non-zero with a message naming the
  missing migration file

### Requirement: Pure-Python scorer MUST have hermetic unit tests that run in CI

The system SHALL provide `analyser/eval/test_scorer.py` with
hand-built fingerprint fixtures verifying `stage1_filter` and
`stage2_score` behaviour. These tests MUST be runnable without
network access, without `fomoplayer` on PATH, and without any prod
credentials.

#### Scenario: Unit tests pass with no external dependencies

- **WHEN** `python -m pytest analyser/eval/test_scorer.py` (or the
  project's equivalent invocation) is run in a clean environment
  with only the Python dependencies installed
- **THEN** all unit tests pass without making network calls or
  invoking subprocesses

### Requirement: Manual parity test MUST compare the Python scorer against the prod diagnostics endpoint

The system SHALL provide a parity-mode test in
`analyser/eval/test_scorer.py` that:

1. Reads canned `(sample_id, preview_id)` pairs from the
   `EVAL_PARITY_PAIRS` environment variable.
2. Pulls both sides' fingerprints from the configured backend via
   `fomoplayer query`.
3. Computes `stage2_score` locally on the Python port.
4. Calls
   `GET /api/admin/exact-match/diagnostics?sampleId=X&previewId=Y`
   on the same backend and reads `currentScorerWouldReturn`.
5. Asserts the local score matches the endpoint's score exactly
   (integer equality).

This test MUST NOT run in CI. It MUST be invoked manually by the
operator before relying on the eval's results, and MUST also be
re-run whenever the Python scorer or the JS scorer
(`db.js:622-753`) is changed.

#### Scenario: Parity holds for canned pairs

- **WHEN** `EVAL_PARITY_PAIRS="10:20,11:21"` is set, the configured
  backend is reachable, and the parity test is invoked
- **THEN** the local `stage2_score` for each pair equals
  `currentScorerWouldReturn` returned by the diagnostics endpoint

#### Scenario: Parity test is skipped when EVAL_PARITY_PAIRS is unset

- **WHEN** `EVAL_PARITY_PAIRS` is not set and the parity test is
  invoked
- **THEN** the test is skipped (not failed), with a message
  explaining how to set the env var

### Requirement: `analyser/eval/README.md` MUST document the grid, cache invalidation policy, and run procedure

The system SHALL include `analyser/eval/README.md` documenting at
minimum:

- The default `--thresholds` and `--bucket-seconds` grid and why
  those defaults were chosen (centered on production's current
  `SAMPLE_MATCH_DEFAULT_THRESHOLD`).
- The cache invalidation policy (cache key includes panako CLI args;
  clear `analyser/eval/.cache/` when in doubt).
- The end-to-end run procedure: `fomoplayer login`, populate
  `sample_match_eval_pair`, run the manual parity test, then run
  `sweep.py`.
- The non-stability caveats: panako is not byte-stable across LMDB
  sessions; distractors are freshly extracted whereas prod
  distractors are old.

#### Scenario: README documents the default grid

- **WHEN** `analyser/eval/README.md` is read
- **THEN** it contains the default `--thresholds` and
  `--bucket-seconds` values that match `sweep.py`'s defaults and
  explains why those values were chosen

#### Scenario: README documents the parity test and the prerequisite of running it

- **WHEN** `analyser/eval/README.md` is read
- **THEN** it explains how to set `EVAL_PARITY_PAIRS` and invoke
  the parity test, and states that the parity test SHOULD be re-run
  whenever either the Python scorer or `db.js:622-753` changes
