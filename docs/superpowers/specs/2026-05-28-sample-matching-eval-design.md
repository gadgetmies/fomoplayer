# Sample-matching evaluation design

**Status:** Approved, ready for plan
**Date:** 2026-05-28

## Problem

The sample-matching pipeline (`packages/back/routes/admin/db.js:622-753`) was
last tuned against the six hermetic fixtures in `analyser/data/` and the
regression test in
`packages/back/test/tests/admin/sample-matching-regression.js`. That covers
correctness on a frozen tiny set but does not measure how well the matcher
performs on real production samples, and gives no way to sweep
`SAMPLE_MATCH_DEFAULT_THRESHOLD` / `SAMPLE_MATCH_BUCKET_SECONDS` against a
realistic dataset before deploying a config change.

The goal of this change is a tool that, given a curated set of
sample→preview pairs from production, runs the full extract+score pipeline
across a parameter grid and reports how well the current code matches.

## Non-goals

- A labeling UI. The operator provides the pair list manually by inserting
  rows into a prod table.
- A CI gate on a production-derived dataset. The eval is a manual
  investigation tool, not a regression check. The existing hermetic
  regression test stays as the CI gate.
- Replacing or modifying the production matcher. The eval is read-only with
  respect to prod data (it only reads from `sample_match_eval_pair`,
  `user_notification_audio_sample`, `store__track_preview`, and their
  related tables).

## Approach

End-to-end re-extraction every run, with an opt-in extraction cache:

- Operator populates a new `sample_match_eval_pair` table in prod with the
  known-correct sample→preview mapping (1-to-1 or 1-to-many).
- A Python script reads the pairs via the existing fomoplayer CLI's
  `fomoplayer query` command (no new backend routes), downloads the audio
  files from prod URLs, runs panako locally to extract fingerprints, and
  scores each sample against (expected previews + K random distractor
  previews) using a pure-Python port of the two-stage matcher.
- Scoring is repeated across a parameter grid (threshold ×
  bucket_seconds), producing a CSV of per-cell results and a console
  summary.

End-to-end re-extraction was chosen over re-using prod's stored
fingerprints because the operator wants the eval to exercise the full
pipeline including extraction. The opt-in cache (`--cache-extractions`,
keyed by file SHA256) keeps iteration fast when only scorer parameters are
being swept.

Two consequences of this choice are documented for callers:

- Panako is not byte-stable across LMDB sessions
  (`analyser/README.md:167-170`). Absolute scores will drift between runs
  with caching disabled. Comparisons within a single run (across grid
  points) are still meaningful; cross-run comparisons are noisy.
- The eval's distractors are freshly extracted locally, whereas production
  distractors are old fingerprints stored months ago. The eval's precision
  signal is an approximation of real-world precision, not a faithful
  reproduction.

The CLI was chosen over direct DB access or new admin HTTP routes because
it already handles auth (`fomoplayer login` → API key), already supports
arbitrary SQL via `packages/cli/src/commands/query.js`, and adds no new
backend surface.

## Components

All new code lives under `analyser/eval/`. Each component has one purpose
and a small interface, so it can be understood and tested in isolation.

### `analyser/eval/scorer.py`

Pure-Python port of `findExactMatchForSample` (`db.js:622-753`). No I/O.
Two public functions:

```python
def stage1_filter(
    sample_hashes: set[int],
    candidate_hashes_by_id: dict[int, set[int]],
    threshold: float,
) -> list[int]:
    """Return candidate IDs whose distinct-hash overlap / len(sample_hashes)
    >= threshold."""

def stage2_score(
    sample_fingerprints: list[tuple[int, int]],   # (hash, t1)
    preview_fingerprints: list[tuple[int, int]],  # (hash, t1)
    bucket_seconds: float,
    seconds_per_block: float = 128 / 16000,       # Panako 2.1 default
) -> int:
    """Cross-join on hash, compute Δt = preview_t1 − sample_t1 in seconds,
    bucket, return peak bucket count."""
```

Unit-testable on hand-built fingerprint dicts.

### `analyser/eval/extraction.py`

Thin wrapper around the existing extraction helpers in
`analyser/panako_processor.py`. Factoring out is mandatory so the eval and
the production analyser share one extraction code path.

```python
def extract(
    audio_url: str,
    cache_dir: pathlib.Path | None = None,
) -> list[tuple[int, int]]:
    """Download audio_url, convert MP3→WAV if needed, run panako, return
    [(hash, t1), ...]. If cache_dir is given, key cache by sha256 of the
    downloaded file."""
```

Factoring approach: move `download_and_manage_file`,
`ensure_downloads_directory`, `compute_file_hash`, and
`extract_panako_fingerprints` from `panako_processor.py` into a new module
`analyser/extraction.py` (project root, not under eval/) and re-export
them from `panako_processor.py` for backwards compatibility. The eval's
`extraction.py` wraps these with the cache layer.

The cache is a directory of JSON files at
`analyser/eval/.cache/<sha256>.json` containing the extracted
fingerprints. Cache enabled by `--cache-extractions` on the CLI.

### `analyser/eval/sweep.py`

The orchestrator. CLI args, sweep loop, output. Shells out to
`fomoplayer query` via subprocess for all DB access. ~150 LOC.

CLI:

```
python analyser/eval/sweep.py \
  --thresholds 0.005,0.008,0.01,0.02,0.05 \
  --bucket-seconds 0.05,0.1 \
  --distractors 20 \
  --seed 42 \
  [--cache-extractions] \
  --out analyser/eval/results-$(date +%Y%m%d-%H%M).csv
```

Defaults: `--distractors 20`, `--seed 42`, no caching, threshold grid
centered on prod's current `SAMPLE_MATCH_DEFAULT_THRESHOLD`, bucket grid
`0.05,0.1`.

### `analyser/eval/test_scorer.py`

Parity test. For 2-3 canned (sample_id, preview_id) pairs that exist in
prod:

1. Pull both sides' fingerprints from prod via `fomoplayer query`.
2. Run `scorer.stage2_score` on them.
3. Hit `GET /api/admin/exact-match/diagnostics?sampleId=X&previewId=Y` on
   the same backend and read the score it returns.
4. Assert they agree (exact integer match — Stage 2 returns a count).

This test runs manually (not in CI) — it requires prod credentials. Its
job is to flag drift between `scorer.py` and `db.js:622-753` whenever
either changes. The test reads the canned pair IDs from an env var
(`EVAL_PARITY_PAIRS=`) so they can be configured per environment without
hardcoding prod-specific data.

## Backend changes

One migration only:

```sql
-- packages/back/migrations/sqls/<timestamp>-add-sample-match-eval-pair-up.sql
CREATE TABLE sample_match_eval_pair (
  user_notification_audio_sample_id INTEGER NOT NULL
    REFERENCES user_notification_audio_sample (user_notification_audio_sample_id)
    ON DELETE CASCADE,
  store__track_preview_id           INTEGER NOT NULL
    REFERENCES store__track_preview (store__track_preview_id)
    ON DELETE CASCADE,
  sample_match_eval_pair_notes      TEXT,
  PRIMARY KEY (user_notification_audio_sample_id, store__track_preview_id)
);
```

(`-down.sql` drops the table.) No code reads this table from the
application; only the eval script (via `fomoplayer query`) does.

No new HTTP routes. No changes to the matcher.

## Data flow per run

```
1. fomoplayer query
     "SELECT user_notification_audio_sample_id, store__track_preview_id
      FROM sample_match_eval_pair"
   → expected pairs

2. fomoplayer query
     "SELECT store__track_preview_id
      FROM store__track_preview
      WHERE store__track_preview_url IS NOT NULL
      ORDER BY store__track_preview_id
      LIMIT 10000"
   → deterministic pool of distractor candidates.
   Then in Python: random.Random(seed).sample(
     [id for id in pool if id not in expected_ids], K
   )
   → K distractor preview IDs (fully reproducible given the same seed
     and the same prod catalog state at the time of the query).

3. fomoplayer query
     "SELECT user_notification_audio_sample_id,
             user_notification_audio_sample_url
      FROM user_notification_audio_sample
      WHERE user_notification_audio_sample_id IN (...samples...)"
   → sample URLs

   fomoplayer query against store__track_preview for preview URLs.

4. For each sample URL + each preview URL (expected + distractors):
     extraction.extract(url, cache_dir=...)
   → fingerprints in memory, keyed by (kind, id)

5. For each (threshold, bucket_seconds) in the grid:
     For each sample:
       For each candidate (expected previews + distractors):
         score = scorer.stage2_score(sample_fps, cand_fps, bucket_seconds)
         passed_stage1 = scorer.stage1_filter(
           sample_hashes, {cand_id: cand_hashes}, threshold
         )
       Record per-pair row:
         (sample_id, candidate_id, is_expected, threshold,
          bucket_seconds, stage1_passed, stage2_score,
          rank_among_candidates)

6. Write results CSV.
7. Print summary table: per (threshold, bucket) cell, top-1 accuracy
   (% samples where an expected preview is the top-scoring candidate),
   top-5 accuracy, recall (% expected pairs that passed stage 1 AND
   had a non-zero stage 2 score), false-positive rate (% samples where
   any distractor outranked all expected previews).
```

## Error handling

- **Missing `sample_match_eval_pair` table:** Script exits non-zero with
  "run migration <name> first" and a pointer to the migration file.
- **Empty pair list:** Exit zero with "no pairs to evaluate; insert rows
  into sample_match_eval_pair".
- **`fomoplayer` not on PATH or not logged in:** Surface the underlying
  subprocess error verbatim. The CLI's own error messages are good enough.
- **Download failure for one file:** Log the URL + error, skip that
  candidate, mark the pair's row in the CSV as `extraction_failed=true`.
  Don't abort the run — the operator wants results for the rest.
- **Panako failure for one file:** Same handling.
- **Parity test failure:** Block the change (the operator runs it
  manually before relying on the eval's numbers).

## Testing

- **`test_scorer.py` (unit):** `scorer.stage1_filter` and
  `scorer.stage2_score` on hand-built fingerprint dicts. Mirrors the
  pattern in `packages/back/test/tests/admin/sample-matching-regression.js`
  fixture format. Runs in CI.
- **`test_scorer.py` (parity, manual):** Compares `scorer.stage2_score`
  against the prod diagnostics endpoint for canned pairs. Runs manually
  when changing the scorer or the SQL.
- **No tests on `sweep.py` itself.** It's a thin orchestrator; the
  scorer and extraction layers carry the testable logic.

## Open questions for the implementation plan

- **Exact `--thresholds` and `--bucket-seconds` defaults:** Pick the grid
  centered on prod's current values once those are read from prod's env.
  Document the grid in `analyser/eval/README.md`.
- **Cache invalidation if panako config changes:** Currently keyed by
  audio file SHA256 only. If `analyser/panako_processor.py` changes the
  panako STRATEGY or other extraction parameters, the cache is silently
  wrong. Mitigation: include a hash of the panako command-line args in
  the cache key, OR document "clear analyser/eval/.cache/ when panako
  config changes". The implementation plan picks one.
- **Distractor reuse across samples:** Currently the script picks K
  distractors per sample independently. An alternative is K distractors
  globally for the whole run, shared across all samples. Global reuse
  cuts extraction cost (K total downloads instead of N×K) at the cost of
  weaker independence between samples. The implementation plan picks one.
