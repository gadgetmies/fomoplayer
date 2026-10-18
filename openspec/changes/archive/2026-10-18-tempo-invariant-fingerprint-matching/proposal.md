## Why

Sample matching silently fails when the recorded audio plays at a different
tempo than the original — exactly what DJs do (±several %, keylock or
vinyl-style). A spike showed Panako hashes survive ±8 % shifts, but our
Stage 2 temporal-coherence scorer assumes slope 1 and loses the match. The
same scorer is the foundation for building tracklists of DJ sets, where
tracks are also pitched and overlap during transitions.

## What Changes

- Stage 2 of the sample matcher searches over tempo factors
  (`preview_pos = a·sample_pos + b`, `a ∈ [1 − D, 1 + D]`,
  `D = SAMPLE_MATCH_MAX_TEMPO_DEVIATION`, default 0.08) instead of assuming
  `a = 1`. `D = 0` restores the old behaviour.
- The matcher SQL moves into a shared module that accepts either a stored
  sample id or in-memory fingerprints, and returns the detected tempo factor
  and offset with each candidate.
- New offline DJ set tooling (developer machine only, no new production
  endpoints or tables): set fingerprint extraction in the analyser, windowed
  matching against the production database over a read-only connection,
  stitching of window detections into a tracklist that tolerates overlapping
  tracks, ground-truth extraction from track-feature-extractor renders, and
  an evaluation report.
- No extraction change, no migration, no re-fingerprinting.

## Capabilities

### New Capabilities
- `dj-set-tracklist`: offline tracklist building for DJ set recordings
  against production preview fingerprints, plus ground truth and evaluation.

### Modified Capabilities
- `sample-matching`: Stage 2 temporal-coherence scoring becomes
  tempo-aware within a configurable deviation and reports the tempo factor.

## Impact

- `packages/back/routes/admin/db.js` (`findExactMatchForSample` delegates),
  new `packages/back/routes/shared/db/fingerprint-matching.js`,
  `packages/back/config.js` (new env var).
- New `packages/back/scripts/dj-set/*`, new `analyser/fingerprint_set.py`.
- Production: Stage 2 does ~10–80× more work per candidate; samples of
  pitched tracks start matching. Rollback: `SAMPLE_MATCH_MAX_TEMPO_DEVIATION=0`.
- Offline tooling reads production with a read-only session.
