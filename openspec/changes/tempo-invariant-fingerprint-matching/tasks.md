## 1. Shared tempo-aware matcher

- [x] 1.1 Add `SAMPLE_MATCH_MAX_TEMPO_DEVIATION` to `packages/back/config.js`
- [x] 1.2 Create `packages/back/routes/shared/db/fingerprint-matching.js` (slope grid + two-stage SQL, sample source = stored sample id or arrays)
- [x] 1.3 Make `findExactMatchForSample` delegate; log tempo factor and duration
- [x] 1.4 Unit tests for the slope grid; DB tests for a synthetic time-stretched sample and zero-deviation equivalence
- [x] 1.5 Existing sample-matching regression/bulk/diagnostics tests pass

## 2. Offline DJ set tooling

- [x] 2.1 `analyser/fingerprint_set.py` (local file or yt-dlp URL → fingerprints JSON)
- [x] 2.2 `packages/back/scripts/dj-set/truth-from-akin.js` (render timeline → truth with prod track ids)
- [x] 2.3 `packages/back/scripts/dj-set/tracklist.js` (windows, read-only matching, cache, stitching)
- [x] 2.4 `packages/back/scripts/dj-set/evaluate.js` (recall/precision/timing/tempo report)

## 3. Validation and iteration

- [x] 3.1 Evaluate on the S30 render; iterate on windowing/stitching parameters
- [x] 3.2 Render additional sets with dj-automation (varispeed, larger tempo deviation, long overlaps) and evaluate
- [x] 3.3 Record results and chosen defaults in the design doc

## 4. Added during implementation

- [x] 4.1 Chunked set extraction (Panako JVM heap limit)
- [x] 4.2 Local mirror of the set's preview rows (sequential-scan COPY from production, read-only)
- [x] 4.3 Refinement, significance-based acceptance, concurrency limit, alternates (`lib/refine.js`) with unit tests
- [x] 4.4 Ground truth for layers, beat jumps and same-cue timeline rows reconstructed from the catalog (`lib/akin-geometry.js`)
- [x] 4.5 Render and evaluate the pitch-shift variant (keylock, ±1 semitone)
