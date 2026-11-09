## 0. Diagnostics gate (BLOCKING — must complete before any 1.x task)

- [x] 0.1 Confirm `debug-sample-matching` has been deployed and the
      local CLI (`python analyser/debug_match.py`) has been run
      against the four built-in fixture pairs.
      *Done: ran the CLI against all 15 cross-pairs of the 6 fixtures
      in `analyser/data/`; raw output captured in design.md.*
- [x] 0.2 Capture the diagnostics output in
      `design.md` under "Decision 0 (gating): Stage isolated."
      The captured output MUST cite specific intersection counts
      and top-bucket numbers for each pair.
- [x] 0.3 Pick exactly one of Decisions 1 (extraction), 2 (upload),
      or 3 (scoring). *Decision 3 (scoring) selected; branch 2C.*

## 1. Configuration plumbing (lands regardless of stage)

- [x] 1.1 Add `SAMPLE_MATCH_DEFAULT_THRESHOLD` (float) to
      `packages/back/config.js` (the natural home for back-only
      tunables; `fomoplayer_shared/config` is reserved for URL/port
      shared across packages). Default `undefined` so missing config
      surfaces as a throw at call time, not a silent fallback.
- [x] 1.2 In `packages/back/routes/admin/db.js`
      `findExactMatchForSample`, read the threshold from config when
      no explicit `threshold` argument is supplied. Throw when both
      arg and config are unset. The route at `api.js:220` now passes
      `undefined` when no query-string threshold is present, so the
      config default flows through.
- [x] 1.3 Document the env var in `packages/back/.env.development`
      and in `analyser/README.md`'s sample-matching section.

## 2. Fix implementation (one of 2A, 2B, 2C depending on Decision 0)

### 2A. Extraction-side fix (run if Decision 0 = extraction)

*Not taken — Decision 0 selected scoring. Documented in `design.md`
under "Side findings": the `.wav`-vs-`.mp3` `(h, f1)` coherence drop
is the closest extraction-side concern, tracked as a follow-up.*

- [x] 2A.1 — N/A (branch not taken)
- [x] 2A.2 — N/A (branch not taken)
- [x] 2A.3 — N/A (branch not taken)
- [x] 2A.4 — N/A (branch not taken)

### 2B. Upload-side fix (run if Decision 0 = upload)

*Not taken — local CLI confirmed the extractor produces signal that
should surface at Stage 1 with a reasonable threshold; no DB↔CLI
disagreement was needed to make the scoring case.*

- [x] 2B.1 — N/A (branch not taken)
- [x] 2B.2 — N/A (branch not taken)
- [x] 2B.3 — N/A (branch not taken). A separate one-shot script,
      `packages/back/migrations/manual/scale-fingerprint-positions.sql`,
      ships to correct legacy 23.222× position inflation discovered
      while running the diagnostics; that's an extraction-tool fix,
      not the proposal's upload fix.
- [x] 2B.4 — N/A (branch not taken)

### 2C. Scoring-side fix (run if Decision 0 = scoring)

- [x] 2C.1 Add `SAMPLE_MATCH_PEAK_BUCKET_MIN` (integer) to
      `packages/back/config.js`. Default `undefined` ⇒ the matcher
      uses `1` (effectively disabled); operators tighten via env.
      The proposal's "lowest-peak-divided-by-two" rule produced
      1.5 ⇒ 1 against our diagnostics, so the in-code default and
      the proposed default coincide.
- [x] 2C.2 Refactor `findExactMatchForSample` into two stages.
      Stage 1 reuses the distinct-hash overlap as a candidate
      selector (bounded `LIMIT 100`) gated by
      `SAMPLE_MATCH_DEFAULT_THRESHOLD`. Stage 2 CROSS JOINs the
      matched-hash rows of the sample and each candidate preview,
      buckets `Δt` by `SAMPLE_MATCH_BUCKET_SECONDS` (default 0.05),
      and selects the peak-bucket count as the final score.
- [x] 2C.3 Stay hash-only. The diagnostics show
      `intersectionHashWithF1Count` collapses to 0 for every pair
      involving the `.wav` rec (`serious_sound_rec`) — gating on `f1`
      would kill recall on any sample uploaded as `.wav`. Logged as a
      follow-up to investigate the pydub-vs-Panako asymmetry.
- [x] 2C.4 Updated the structured log: emits `bucketSeconds`,
      `peakBucketMin`, `candidateRowCount`, `topMatchingHashes`,
      `topStage1Ratio`, `topPeakDeltaTSeconds`, plus the existing
      `topScore` / `topPreviewId`.

## 3. Fixture-based regression tests

- [x] 3.1 Extract fingerprints offline for all six fixture files in
      `analyser/data/` (mantra_full was added during diagnostics) via
      `extract_panako_fingerprints` directly. Stored as
      `packages/back/test/fixtures/sample-matching/<base>.json` with
      shape `{ file, fingerprintCount, fingerprints }`.
- [x] 3.2 Added `packages/back/test/tests/admin/sample-matching-regression.js`
      that seeds every fixture as both a sample and a preview, then
      asserts the bindings from spec.md:
      - `mantra_rec` → `mantra_full` (rank 1), `mantra_preview` (rank 2)
      - `serious_sound_rec` → `serious_sound_full` (rank 1),
        `serious_sound_preview` (rank 2)
      - `mantra_full` → `mantra_preview` (rank 1)
      - `serious_sound_full` → `serious_sound_preview` (rank 1)
      - Cross-group queries do not surface any cross-group candidate
        at threshold 0.008.
      Also includes a "throws when neither threshold arg nor
      SAMPLE_MATCH_DEFAULT_THRESHOLD is set" scenario (spec §
      "Unset config with no explicit threshold throws").
- [x] 3.3 Documented the fixture re-extraction procedure in
      `analyser/README.md` under "Fixture fingerprint re-extraction."

## 4. Documentation and cleanup

- [x] 4.1 `analyser/README.md` now names the fix surface (scoring)
      and cites the diagnostic numbers that ruled out extraction and
      upload, under "Sample-matching fix history (2026-05-24)."
- [x] 4.2 The temporal-coherence algorithm sketch is in
      `analyser/README.md` under "Stage 2 (temporal coherence)
      algorithm."
- [x] 4.3 Removed the in-source `threshold = 0.5` default from
      `findExactMatchForSample` (the signature is now
      `findExactMatchForSample(sampleId, threshold, opts)` with no
      default value; resolution falls through to
      `config.sampleMatchDefaultThreshold`, then throws).
