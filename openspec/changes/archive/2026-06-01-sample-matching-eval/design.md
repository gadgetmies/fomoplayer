## Context

The production exact-match sample identifier lives in
`packages/back/routes/admin/db.js:622-753`. Its tuning parameters
(`SAMPLE_MATCH_DEFAULT_THRESHOLD`, `SAMPLE_MATCH_BUCKET_SECONDS`,
`SAMPLE_MATCH_PEAK_BUCKET_MIN`) currently get exercised by six fixture
files in `analyser/data/` and the hermetic regression test
`packages/back/test/tests/admin/sample-matching-regression.js`. Those
fixtures are intentionally small and fully controllable, so the
regression test can act as a CI gate — but they are not representative
of production samples and cannot answer "would this threshold change
have caught the sample identification bug that occurred last week".

Two existing facts shape this design:

- Panako is not byte-stable across LMDB sessions
  (`analyser/README.md:167-170`). The same audio extracted twice in
  different runs may yield slightly different hash counts. This rules
  out "diff the run output across days" workflows and forces all
  comparisons to live within a single eval invocation.
- The `fomoplayer` CLI (`packages/cli/`) already handles login and
  exposes `fomoplayer query <SQL>`, which executes raw SQL over the
  authenticated admin session. This means a Python harness can read
  prod data without us adding new HTTP routes.

The stakeholders are:

- The matcher operator (currently the same person tuning the matcher) —
  needs an answer to "what threshold should I deploy?"
- Future-me / a future operator reading the eval results — needs the
  run to be reproducible and the output to be machine-readable.

## Goals / Non-Goals

**Goals:**

- Run the production two-stage matcher's exact scoring logic across a
  curated production sample→preview dataset with K random distractor
  previews per sample, for a configurable grid of
  `(threshold, bucket_seconds)`.
- Produce both a per-pair CSV (for ad-hoc analysis) and a console
  summary table (top-1 / top-5 accuracy, recall, false-positive rate).
- Make extraction the slow expensive step that can be cached on demand,
  so threshold sweeps after the first run are fast.
- Share one extraction code path between the eval and the production
  analyser so the eval's "extract" is exactly what prod did.
- Surface drift between the Python scorer port and the JS scorer in
  `db.js` via a manual parity test against the existing diagnostics
  endpoint.

**Non-Goals:**

- A labeling UI. The operator manually inserts rows into
  `sample_match_eval_pair`.
- A CI gate on production-derived data. The hermetic regression test
  stays as the CI gate; this eval is a manual investigation tool.
- Replacing the production matcher or running the eval inside the
  backend process. The eval is a standalone Python tool that only reads
  prod via `fomoplayer query`.
- Bit-exact cross-run reproducibility. Within a single run, distractor
  selection is deterministic given `--seed`, but extraction is not
  byte-stable across runs.

## Decisions

### Decision 1: End-to-end re-extraction with an opt-in cache

The eval re-runs panako extraction on each audio file every run, with
an opt-in cache (`--cache-extractions`) keyed by SHA256 of the
downloaded file.

**Why:** The operator wants the eval to exercise the full pipeline
(download + decode + extract + score), so reusing prod's stored
fingerprints would hide extraction-side regressions. Caching is opt-in
so the default run is "honest" and the operator can flip caching on
when they know they're only sweeping scorer parameters.

**Cache invalidation:** The cache key includes the panako command-line
args (strategy, profile, etc.), not just the file SHA256. This catches
the silent-corruption case where `panako_processor.py` changes its
extraction parameters but the cache still has fingerprints from the
old config. The eval's `README.md` also documents
"clear `analyser/eval/.cache/` when in doubt" as a belt-and-braces
mitigation.

**Alternatives considered:**

- *Re-use prod's stored fingerprints*: Rejected. Operator explicitly
  wants the eval to cover extraction, not just scoring.
- *Always cache*: Rejected. Cross-run drift in panako output is real;
  if the cache silently hid that, the eval would lie.
- *Don't cache at all*: Rejected. A 50-pair eval with K=20 distractors
  means ~1050 downloads + extractions per run. Iteration cost is real.

### Decision 2: `fomoplayer query` for all DB access, no new backend routes

The Python script shells out to `fomoplayer query "<SQL>"` for every
DB read. No new HTTP routes are added to `packages/back`.

**Why:** The CLI already handles auth, already supports arbitrary SQL,
and adds zero new backend surface area. The eval is a one-operator
tool that runs on the operator's machine — there's no auth boundary
to design and no production endpoint to harden.

**Alternatives considered:**

- *New `/api/admin/eval/pairs` endpoint*: Rejected. Adds backend code
  that exists only to serve one Python script. The CLI's `query`
  already does the same job.
- *Direct DB connection from Python*: Rejected. Now the eval needs DB
  credentials, which the CLI already negotiates.

### Decision 3: Pure-Python port of the scorer + manual parity test

`analyser/eval/scorer.py` contains a from-scratch implementation of
the two-stage matcher (`stage1_filter` overlap-ratio gate, then
`stage2_score` Δt-bucket peak count). A manual parity test
(`analyser/eval/test_scorer.py` parity mode) compares its scores
against the existing diagnostics endpoint
(`GET /api/admin/exact-match/diagnostics`) for canned pairs.

**Why:** Sweeping parameters from Python requires Python access to the
scoring logic. Calling the JS matcher per cell would mean K × G HTTP
round-trips per sample where G is the grid size — slow, and the prod
matcher doesn't expose a "score this specific pair at this specific
threshold" endpoint anyway (the diagnostics endpoint scores at a
single configurable threshold). A port avoids both issues.

**Drift risk:** A port can silently diverge from
`db.js:622-753`. The parity test mitigates: any change to the scorer
on either side requires re-running it. It reads pair IDs from
`EVAL_PARITY_PAIRS` so the canned data lives outside the repo.

**Alternatives considered:**

- *Embed a JS runtime to call the actual `db.js` function*: Rejected.
  Major dependency for a tool that should stay light.
- *Expose a scorer-only HTTP endpoint and call it per cell*: Rejected.
  Network cost dominates for large grids; adds prod surface area.
- *Skip the parity test*: Rejected. The whole point of the eval is to
  tune the production matcher. If the port drifts, every sweep result
  is suspect.

### Decision 4: Refactor extraction helpers into `analyser/extraction.py`

The four helpers `download_and_manage_file`,
`ensure_downloads_directory`, `compute_file_hash`, and
`extract_panako_fingerprints` move from `analyser/panako_processor.py`
to a new module `analyser/extraction.py` (project root, not under
`eval/`). `panako_processor.py` re-exports them so existing imports
continue to work.

**Why:** The eval must use the same extraction code that production
uses; otherwise extraction-side drift between the eval and prod
invalidates results. Moving the helpers to a shared module — instead
of importing them through `panako_processor.py` — keeps the
import graph clean: `panako_processor.py` is the prod entry point and
shouldn't be on the eval's import path.

**Alternatives considered:**

- *Have the eval import directly from `panako_processor.py`*:
  Rejected. `panako_processor.py` is a long-running worker script
  with module-level side effects; importing it from a one-shot CLI is
  fragile.
- *Duplicate the helpers in the eval*: Rejected. The whole point of
  the refactor is to keep extraction code in one place.

### Decision 5: One new table, no schema changes elsewhere

The only schema change is a new `sample_match_eval_pair` table with
two FK columns and an optional notes column. No alterations to
`user_notification_audio_sample` or `store__track_preview`.

**Why:** The eval needs a place to store the curated
sample→preview mapping. It must reference real prod rows
(`ON DELETE CASCADE`) so deleted samples don't leave dangling eval
pairs. No application code reads from it, so no further changes are
needed.

### Decision 6: Distractor selection is deterministic per sample

Distractor previews are selected with `random.Random(seed).sample(...)`
from a pool of the first 10 000 `store__track_preview` rows ordered by
ID, after excluding any preview that appears in the expected set. The
selection is **per-sample** (not global across the run), and the seed
is `--seed` (default `42`).

**Why per-sample:** Different samples can have different "expected"
sets, so different exclusion lists, so a single global distractor list
would either (a) inflate the pool when a sample has many expected
previews, or (b) require per-sample re-filtering anyway. Per-sample
selection is conceptually simpler and reproducible from
`(seed, sample_id, expected_ids, prod_catalog_state)`.

**Trade-off:** Extraction cost is N × K where N is the number of
samples and K is `--distractors`. A future optimisation (global
distractor pool, share across samples) is feasible but explicitly
deferred.

### Decision 7: Grid centered on prod's current config

Default grid: `--thresholds 0.005,0.008,0.01,0.02,0.05`,
`--bucket-seconds 0.05,0.1`. The middle threshold (`0.008`) matches
the current production `SAMPLE_MATCH_DEFAULT_THRESHOLD`.

**Why:** The operator's mental model is "current value plus or minus".
A grid that brackets the current value at log-ish spacing gives both
directions of sensitivity in one run. Documented in
`analyser/eval/README.md` and overridable on the CLI.

## Risks / Trade-offs

- **[Risk] Panako not byte-stable across runs (LMDB session noise)** →
  Mitigation: document that cross-run comparisons are noisy and that
  meaningful comparisons happen across grid cells within a single run.
  Optional `--cache-extractions` removes this noise for sweeps that
  only vary scorer params.
- **[Risk] Distractor previews are freshly extracted in the eval but
  months-old fingerprints in prod, so the eval's precision signal is
  an approximation, not a faithful reproduction** → Mitigation:
  document this limitation in `README.md`; treat eval precision as a
  directional indicator, not an absolute number.
- **[Risk] Scorer port drifts from `db.js:622-753`** → Mitigation: the
  manual parity test (`test_scorer.py` parity mode) catches drift
  whenever either side is touched. The parity test blocks the change
  when it fails.
- **[Risk] Cache silently wrong if panako config changes** →
  Mitigation: cache key includes a hash of the panako command-line
  args, plus documentation says "clear `.cache/` when in doubt".
- **[Risk] Operator misconfigures `fomoplayer` and the eval reads from
  a non-prod backend** → Mitigation: the script logs the resolved API
  URL (output of `fomoplayer config get apiUrl` or similar) before
  starting the sweep, so the operator can confirm before committing
  to a long extraction run.
- **[Risk] Adding a table to prod with no application reader looks
  like cruft** → Mitigation: the `sample_match_eval_pair_notes`
  column gives the operator a place to explain each pair; the
  migration's commit message and `analyser/eval/README.md` state who
  reads the table.

## Migration Plan

The change is additive and read-only with respect to the existing
matcher, so deployment is straightforward.

1. **Land the refactor first** (extraction helpers move to
   `analyser/extraction.py`, `panako_processor.py` re-exports). This
   is independently verifiable — `panako_processor.py` still runs
   end-to-end against the existing analyser entry point.
2. **Run the migration** (`sample_match_eval_pair` table). No code
   reads from it, so the migration is safe to apply ahead of the
   Python code.
3. **Ship the Python eval** (`analyser/eval/`). The unit tests
   (`test_scorer.py`) run in CI.
4. **Operator runs the manual parity test** against a live backend
   pointed at prod data, using canned pair IDs in
   `EVAL_PARITY_PAIRS`. If parity fails, the change does not move
   forward to actual sweeps.
5. **Operator populates `sample_match_eval_pair`** with curated
   sample→preview mappings (`INSERT` via `fomoplayer query` or
   direct DB access). The change ships without seed rows; populating
   it is a separate operational step.

**Rollback:**

- The Python eval can simply be deleted (no in-tree consumers).
- The `sample_match_eval_pair` table has a `-down.sql` migration that
  drops it. Nothing else reads from it, so dropping is safe.
- The extraction-helpers refactor is the only intrusive piece; if it
  needs rolling back, revert the refactor commit. Existing callers
  see no behavioural change because the re-exports preserve the old
  import surface.

## Open Questions

- **Exact `--thresholds` / `--bucket-seconds` defaults to ship in
  `README.md`.** Picked tentatively above (`0.005,0.008,0.01,0.02,0.05`
  × `0.05,0.1`). To be confirmed against prod's actual
  `SAMPLE_MATCH_DEFAULT_THRESHOLD` at implementation time.
- **Should the parity test be promoted to CI later?** Not in this
  change. It needs prod credentials, and adding a credential-gated
  CI job is a separate decision. Tracked as a follow-up.
- **Should there be a "compare two eval runs" diff tool?** Out of
  scope. Panako non-determinism means a naïve diff would be noisy;
  if this becomes a real need, design it as a separate tool that
  uses `--cache-extractions` and only varies scorer parameters.
