## 1. Extraction-helpers refactor

- [x] 1.1 Create `analyser/extraction.py` containing
      `download_and_manage_file`, `ensure_downloads_directory`,
      `compute_file_hash`, and `extract_panako_fingerprints`, moved
      verbatim from `analyser/panako_processor.py`.
- [x] 1.2 Replace the helper definitions in
      `analyser/panako_processor.py` with re-exports from
      `analyser.extraction` (`from analyser.extraction import …`) so
      existing call sites continue to resolve.
- [x] 1.3 Run the existing analyser entry point against
      `analyser/data/` and confirm it still produces fingerprints —
      this verifies the refactor is behaviour-preserving.

## 2. Migration: `sample_match_eval_pair` table

- [x] 2.1 Add `packages/back/migrations/sqls/<timestamp>-add-sample-match-eval-pair-up.sql`
      creating the table with the two FK columns
      (`ON DELETE CASCADE`), nullable
      `sample_match_eval_pair_notes`, and the composite primary key.
- [x] 2.2 Add the matching `-down.sql` that drops the table.
- [x] 2.3 Apply the migration on a local dev DB; verify the table
      exists, the FKs cascade on parent delete, and the down
      migration cleanly removes the table.

## 3. Pure-Python scorer

- [x] 3.1 Create `analyser/eval/__init__.py` (empty package marker).
- [x] 3.2 Implement `analyser/eval/scorer.py` with `stage1_filter`
      and `stage2_score` as defined in `design.md`. No I/O, no
      globals.
- [x] 3.3 Add `analyser/eval/test_scorer.py` (unit mode) with
      hand-built fingerprint fixtures covering: empty intersection,
      threshold inclusion at boundary, dominant Δt bucket detection,
      Δt bucket rounding behaviour at the
      `seconds_per_block = 128/16000` granularity.
- [x] 3.4 Run the unit tests in a clean shell with no `fomoplayer`
      on PATH and no network access; confirm they pass.

## 4. Extraction wrapper with opt-in cache

- [x] 4.1 Implement `analyser/eval/extraction.py:extract(audio_url,
      cache_dir=None)` calling into `analyser.extraction`.
- [x] 4.2 Compute the cache key as
      `sha256(file_contents) ⊕ sha256(panako CLI args)` so changing
      the panako command-line invalidates cached entries
      automatically.
- [x] 4.3 Persist cache entries to `<cache_dir>/<key>.json`. Atomic
      write (write to `.tmp`, rename) so a crashed run never leaves
      a half-written cache file.
- [x] 4.4 Add a focused test (can be in `test_scorer.py` or a sibling
      file) that calls `extract(...)` twice with caching enabled
      against a small local fixture file and verifies the second
      call does not re-invoke panako.

## 5. Sweep orchestrator

- [x] 5.1 Implement `analyser/eval/sweep.py` argparse with the CLI
      flags listed in the spec
      (`--thresholds`, `--bucket-seconds`, `--distractors`,
      `--seed`, `--cache-extractions`, `--out`). Defaults per
      `design.md`.
- [x] 5.2 Implement a thin `fomoplayer query` subprocess wrapper that
      surfaces stderr verbatim on failure and parses the result
      table into Python data structures.
- [x] 5.3 Implement the three queries described in the spec:
      expected pairs, distractor pool (first 10 000 previews ordered
      by ID), and the URL lookup for samples + previews.
- [x] 5.4 Implement deterministic per-sample distractor selection
      via `random.Random(seed).sample(pool minus expected, K)`.
- [x] 5.5 Implement the extraction phase: extract every unique
      sample URL and every unique candidate preview URL exactly
      once via `analyser.eval.extraction.extract(...)`.
- [x] 5.6 Implement the sweep loop scoring every
      `(sample, candidate, threshold, bucket_seconds)` combination
      via `scorer.stage1_filter` + `scorer.stage2_score`.
- [x] 5.7 Write the per-pair CSV with the columns listed in the
      spec.
- [x] 5.8 Print the per-cell summary table: top-1 accuracy, top-5
      accuracy, recall, false-positive rate.
- [x] 5.9 Implement the four error paths defined in the spec:
      missing table → non-zero + migration pointer; empty table →
      zero exit with message; missing/unauthed `fomoplayer` →
      surface subprocess error; per-file extraction failure → log
      and mark CSV row, continue.
- [x] 5.10 Log the resolved `fomoplayer` API URL at startup so the
       operator can confirm the target environment before a long
       run.

## 6. Parity test (manual)

- [x] 6.1 Add a parity test mode to `analyser/eval/test_scorer.py`
      that reads `EVAL_PARITY_PAIRS` (format `id:id,id:id,...`).
- [x] 6.2 In parity mode: pull both sides' fingerprints via
      `fomoplayer query`, compute `stage2_score` locally, hit
      `GET /api/admin/exact-match/diagnostics`, and assert exact
      integer equality with `currentScorerWouldReturn`.
- [x] 6.3 When `EVAL_PARITY_PAIRS` is unset, the parity test SHALL
      be skipped (not failed) with a message explaining how to set
      it. Ensure the test framework's "skip" status is used.
- [x] 6.4 Confirm the parity test is NOT picked up by CI by
      tagging it `manual` or guarding behind an env var that CI
      does not set. Document the exclusion in the README.

## 7. Documentation

- [x] 7.1 Write `analyser/eval/README.md` covering: the default
      grid and rationale; the cache invalidation policy; the
      end-to-end run procedure (`fomoplayer login`, populate
      `sample_match_eval_pair`, run parity test, run sweep);
      the panako non-stability caveat; the
      eval-vs-prod distractor freshness caveat.
- [x] 7.2 Update `analyser/README.md` with a short pointer
      to `eval/` so future readers can find it from the
      analyser entry point.

## 8. End-to-end shakedown

- [ ] 8.1 Pick a small starter set of 3-5 sample→preview pairs
      (operator's existing labelled set) and INSERT them into a
      local copy of `sample_match_eval_pair`.
- [ ] 8.2 Run `python analyser/eval/sweep.py --out /tmp/eval.csv`
      against that local copy. Confirm the CSV has the expected
      columns and the console summary renders.
- [ ] 8.3 Re-run with `--cache-extractions` and confirm the second
      run is materially faster (extraction skipped, scoring still
      runs).
- [ ] 8.4 Run the manual parity test against a backend pointed at
      prod data with `EVAL_PARITY_PAIRS` set; confirm exact
      integer agreement between the Python port and the prod
      diagnostics endpoint for the canned pairs.
