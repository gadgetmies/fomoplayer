# Sample-matching evaluation

A standalone tool that re-extracts and re-scores curated production
sample → preview pairs across a `(threshold, bucket_seconds)` grid, so
operators can tune `SAMPLE_MATCH_DEFAULT_THRESHOLD` /
`SAMPLE_MATCH_BUCKET_SECONDS` before deploying a change.

The eval is a manual investigation tool. The CI gate is the hermetic
regression test
(`packages/back/test/tests/admin/sample-matching-regression.js`) — not
this. Run this when you want to answer "what threshold should I deploy
against real production samples?"

## Run procedure

1. **Authenticate the CLI** against the environment whose data you
   want to evaluate against. Production for an honest read; a staging
   replica for safer iteration.

   ```bash
   fomoplayer login
   ```

   The sweep logs the resolved API URL at startup — verify it before
   committing to a long extraction run.

2. **Populate `sample_match_eval_pair`** with curated correct
   sample → preview mappings. The eval does not seed this table; it is
   intentionally an operator-curated dataset.

   ```sql
   INSERT INTO sample_match_eval_pair (
     user_notification_audio_sample_id,
     store__track_preview_id,
     sample_match_eval_pair_notes
   ) VALUES (123, 4567, 'mantra reference set');
   ```

3. **Run the manual parity test** before relying on any sweep result.
   This confirms the pure-Python scorer matches the production JS
   scorer on canned pairs. Re-run whenever the Python scorer
   (`scorer.py`) or the JS scorer (`packages/back/routes/admin/db.js:622-753`)
   changes.

   ```bash
   EVAL_PARITY_PAIRS="123:4567,124:4568" \
   FOMOPLAYER_BACKEND_URL=https://your-backend \
   python -m pytest eval/test_scorer.py::test_parity_against_diagnostics_endpoint -v
   ```

   The test is skipped when `EVAL_PARITY_PAIRS` is unset, which is what
   keeps it out of CI.

4. **Run the sweep**:

   ```bash
   cd analyser
   source venv/bin/activate
   python eval/sweep.py --out /tmp/eval.csv
   ```

   First run: every preview is downloaded and extracted, so this is
   slow (roughly `N samples × (1 + distractors) × extraction time`).
   The CSV has one row per `(sample_id, candidate_id, threshold,
   bucket_seconds)`; the console prints a per-cell summary.

5. **Re-run with caching** to iterate on threshold/bucket params
   without paying extraction cost again:

   ```bash
   python eval/sweep.py --out /tmp/eval.csv --cache-extractions
   ```

## Default grid and why

```
--thresholds 0.005,0.008,0.01,0.02,0.05
--bucket-seconds 0.05,0.1
--distractors 20
--seed 42
```

The middle threshold (`0.008`) is the current production
`SAMPLE_MATCH_DEFAULT_THRESHOLD` (see `analyser/README.md` for the
2026-05-24 incident write-up). The other four thresholds bracket it at
roughly log spacing so a single run shows sensitivity in both
directions. Bucket sizes 0.05 / 0.1 cover prod's default (0.05) and a
looser variant that absorbs more Δt drift.

Defaults are overridable on the CLI; the sweep records the values used
in every CSV row.

## Cache invalidation

Caching is opt-in (`--cache-extractions`). The cache key is

```
sha256(file_contents) ⊕ sha256(panako CLI args)
```

So:

- Changing the audio file (re-encoded preview, new sample upload) →
  cache misses naturally.
- Changing the panako CLI args (e.g. `STRATEGY=OLAF`, a different
  storage backend) → cache misses naturally.

When in doubt, clear `analyser/eval/.cache/` and re-run without
`--cache-extractions` first to verify extraction behaviour, then turn
caching back on for parameter sweeps.

## Caveats

- **Panako is not byte-stable across LMDB sessions.** The same audio
  extracted twice on different days can yield slightly different
  fingerprint counts. Meaningful comparisons happen between grid cells
  within a single run; cross-run comparisons are noisy. See
  `analyser/README.md:167-170`.
- **Distractor freshness mismatch.** The eval freshly extracts every
  distractor preview, while production rows are months-old
  fingerprints. The eval's false-positive rate is therefore a
  directional indicator, not a faithful reproduction of what prod
  sees.
- **Drift between Python and JS scorers.** The Python port can drift
  silently. The manual parity test (step 3 above) is the safety net —
  re-run it whenever either scorer is touched.

## How DB access works (and what it does NOT touch)

- All reads go through `fomoplayer query` — no new HTTP routes, no
  direct DB credentials in Python.
- The eval reads from `sample_match_eval_pair`,
  `user_notification_audio_sample`, and `store__track_preview`. It
  writes nothing.
- The production matcher is not invoked. The scoring runs in
  `analyser/eval/scorer.py`, a from-scratch Python port whose parity
  with the production matcher is checked by `test_scorer.py`'s parity
  mode.
