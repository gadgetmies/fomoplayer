## Purpose

Diagnose why exact-match sample identification is or is not firing for a
given (sample, preview) pair by exposing the underlying Panako
fingerprint statistics — per-file counts, intersection sizes, offset
histograms, and the score the production matcher would emit — through
both a local CLI for fixture audio and a backend admin endpoint for
production data, and by logging one structured line per
`findExactMatchForSample` invocation.

## Requirements

### Requirement: Local CLI MUST report per-pair fingerprint statistics for the analyser/data fixtures

`analyser/debug_match.py` MUST run Panako fingerprint extraction on
each member of every supplied or default pair, and for each pair MUST
print to stdout (and emit on `--json`) the per-file fingerprint counts
(total, distinct hash, distinct `(hash, f1)`), the intersection
sizes (hash-only and `(hash, f1)`), Jaccard and containment scores,
and the top 10 buckets of the `Δt = position_preview −
position_sample` histogram bucketed at `--bucket-seconds`.

The four built-in default pairs are
mantra_rec ↔ mantra_preview,
serious_sound_rec ↔ serious_sound_preview,
serious_sound_rec ↔ serious_sound_full, and
serious_sound_full ↔ serious_sound_preview.

The CLI MUST exit non-zero if any *positive* pair fails to produce a
peak histogram bucket whose count is at least
`--peak-multiplier × median bucket count` (default `3.0`).

#### Scenario: Default invocation reports all four built-in pairs

- **WHEN** `python analyser/debug_match.py` is run with no arguments
- **THEN** the script extracts fingerprints for all five fixture
  files in `analyser/data/` exactly once each, emits one summary
  row per file and one summary row per pair, and emits the top 10
  offset-histogram buckets for each pair

#### Scenario: Failing positive pair causes non-zero exit

- **WHEN** any of the four built-in positive pairs has no peak
  bucket reaching the `--peak-multiplier` threshold over the
  median bucket
- **THEN** the script prints the failing pair(s) with their peak
  and median bucket counts and exits with status `1`

#### Scenario: --json output is machine-readable

- **WHEN** `python analyser/debug_match.py --json` is run
- **THEN** the script emits one valid JSON object per pair on
  stdout, each containing keys `pair`, `files`, `intersection`,
  `topOffsetBuckets`, `peakBucket`, `medianBucket`, and `passed`

### Requirement: Backend diagnostics endpoint MUST report fingerprint statistics for a (sampleId, previewId) pair

`GET /api/admin/exact-match/diagnostics?sampleId=&previewId=` MUST
return a JSON object containing the per-side fingerprint counts, the
hash-only and `(hash, f1)` intersection counts, Jaccard, containment
against each side, the top 20 offset-histogram buckets, and
`currentScorerWouldReturn` (the score `findExactMatchForSample`
would emit for this pair at the supplied or default threshold).

If either side exceeds `maxPerSide` (default 10 000) fingerprints,
the response MUST include `truncated: true` and the operator MUST be
informed in the response body that some fingerprints were dropped.

The endpoint MUST reuse the same admin authentication middleware as
the existing `/admin/exact-match/audio-samples/:sampleId/match`
endpoint.

#### Scenario: Valid sampleId and previewId returns the full diagnostics shape

- **WHEN** an admin caller requests
  `GET /api/admin/exact-match/diagnostics?sampleId=10&previewId=20`
- **THEN** the response is `200` with a JSON body containing keys
  `sampleHashCount`, `previewHashCount`,
  `intersectionHashCount`, `intersectionHashWithF1Count`,
  `jaccard`, `containmentAgainstSample`,
  `containmentAgainstPreview`, `topOffsetBuckets`,
  `currentScorerWouldReturn`, and `truncated`

#### Scenario: Missing or non-numeric query params return 400

- **WHEN** the endpoint is called without `sampleId`, without
  `previewId`, or with non-numeric values for either
- **THEN** the response is `400` with body
  `{ error: 'sampleId and previewId required as integers' }`
  and no DB call is made

#### Scenario: DB error returns 500 with the error message

- **WHEN** `queryFingerprintDiagnostics` throws
- **THEN** the response is `500` with the error message in the
  body and the error is logged via the shared error logger

### Requirement: `findExactMatchForSample` MUST emit one structured log line per invocation

`findExactMatchForSample` (`packages/back/routes/admin/db.js`) MUST
emit exactly one `logger.info` per call, after the SQL completes,
with fields `sampleId`, `threshold`, `sampleHashCount`,
`candidateRowCount`, `topScore` (or `null` when no candidates
survive the threshold), and `topPreviewId` (or `null` likewise).
The log MUST NOT be emitted from a per-row loop.

#### Scenario: Match with surviving candidates logs the top score

- **WHEN** `findExactMatchForSample` is called and the SQL returns
  at least one row
- **THEN** exactly one `info` log is emitted with `topScore` and
  `topPreviewId` set to the values from the first returned row

#### Scenario: Match with no surviving candidates logs null top score

- **WHEN** `findExactMatchForSample` is called and the SQL returns
  zero rows
- **THEN** exactly one `info` log is emitted with `topScore: null`
  and `topPreviewId: null` and the correct `sampleHashCount`

### Requirement: The default sample-match threshold MUST come from configuration, not source

`findExactMatchForSample` MUST consult `SAMPLE_MATCH_DEFAULT_THRESHOLD`
(via `fomoplayer_shared/config`) when no explicit `threshold` is
passed by the caller. The in-source default of `0.5` MUST be removed.
If the config value is unset, the function MUST throw at call time
with a message naming the env var, so silent reliance on the old
default is impossible.

#### Scenario: Threshold from config is honoured

- **WHEN** `SAMPLE_MATCH_DEFAULT_THRESHOLD=0.01` is set and
  `findExactMatchForSample(sampleId)` is called with no threshold
- **THEN** the SQL is executed with `threshold = 0.01`

#### Scenario: Explicit threshold argument overrides the config default

- **WHEN** `findExactMatchForSample(sampleId, 0.2)` is called
- **THEN** the SQL is executed with `threshold = 0.2` regardless of
  the value of `SAMPLE_MATCH_DEFAULT_THRESHOLD`

#### Scenario: Unset config with no explicit threshold throws

- **WHEN** `SAMPLE_MATCH_DEFAULT_THRESHOLD` is unset and
  `findExactMatchForSample(sampleId)` is called with no threshold
- **THEN** the function throws an `Error` whose message names the
  required env var, and no SQL is executed

### Requirement: Fixture pairs from analyser/data MUST be returned as rank-1 matches

`findExactMatchForSample` MUST surface the binding positive previews
listed below when seeded with fingerprints extracted offline from the
six fixture files in `analyser/data/`
(`mantra_full.mp3`, `mantra_preview.mp3`, `mantra_rec.mp3`,
`serious_sound_full.mp3`, `serious_sound_preview.mp3`,
`serious_sound_rec.wav`), and MUST rank them in the order shown — all
at scores ≥ the configured default threshold (0.008). Diagnostics
(captured in the archived change `2026-05-24-fix-sample-matching`'s
`design.md` Decision 0) showed that `mantra_rec` is a time-stretched
recording of `mantra_full` (not `mantra_preview`); the binding pairs
below reflect that.

Required ranks:

- `mantra_rec` → `mantra_full` (rank 1, ratio ≈ 0.118),
  `mantra_preview` (rank 2, ratio ≈ 0.013).
- `serious_sound_rec` → `serious_sound_full` (rank 1, ratio ≈ 0.226),
  `serious_sound_preview` (rank 2, ratio ≈ 0.144).
- `mantra_full` → `mantra_preview` (rank 1, ratio ≈ 0.246).
- `serious_sound_full` → `serious_sound_preview` (rank 1,
  ratio ≈ 0.196).

For any cross-group sample/candidate pair (any `mantra_*` sample paired
with any `serious_sound_*` candidate, or vice versa),
`findExactMatchForSample` MUST NOT return the cross-group candidate
above the configured default threshold. (Cross-group ratios in the
diagnostics are all ≤ 0.005, below the 0.008 default.)

#### Scenario: mantra_rec sample returns mantra_full at rank 1, mantra_preview at rank 2

- **WHEN** the DB is seeded with fingerprints extracted from
  `analyser/data/mantra_full.mp3`, `analyser/data/mantra_preview.mp3`,
  and `analyser/data/mantra_rec.mp3`, and
  `findExactMatchForSample(<mantra_rec_id>)` is called with the
  configured default threshold
- **THEN** the returned rows include the mantra_full preview at
  rank 1 with score ≥ 0.008 and the mantra_preview preview at rank 2
  with score ≥ 0.008

#### Scenario: serious_sound_rec sample returns serious_sound_full at rank 1, serious_sound_preview at rank 2

- **WHEN** the DB is seeded with fingerprints extracted from
  `serious_sound_full.mp3`, `serious_sound_preview.mp3`, and
  `serious_sound_rec.wav`, and `findExactMatchForSample(<serious_sound_rec_id>)`
  is called with the configured default threshold
- **THEN** the returned rows include the serious_sound_full preview
  at rank 1 and the serious_sound_preview preview at rank 2, each
  with score ≥ 0.008

#### Scenario: Cross-group pairing does not surface above threshold

- **WHEN** the DB is seeded with fingerprints from `mantra_rec.mp3`
  and `serious_sound_preview.mp3` (no shared content) and
  `findExactMatchForSample(<mantra_rec_id>)` is called with the
  configured default threshold
- **THEN** the call either returns zero rows, OR returns the
  serious_sound_preview row at a score below the configured
  threshold

### Requirement: When the scoring-stage fix lands, the matcher MUST use temporal-coherence rescoring

`findExactMatchForSample` MUST run a two-stage pipeline whenever the
scoring-stage fix is the one taken (Decision 0 = scoring in the
archived change `2026-05-24-fix-sample-matching`'s `design.md`). If
Decision 0 selects extraction or upload, this requirement is
documented as "not applicable" and the corresponding scenarios are
omitted.

The two stages MUST be:

1. Candidate selection by distinct-hash overlap above
   `SAMPLE_MATCH_DEFAULT_THRESHOLD`.
2. Temporal-coherence rescoring per candidate: for each matched
   `(hash, position_sample, position_preview)` row, compute
   `Δt = position_preview − position_sample`, bucket by 0.05 s, and
   take the count of the peak bucket as the candidate's final score.

Candidates MUST be ranked by Stage 2's peak-bucket count, not by
Stage 1's overlap. A candidate whose Stage 2 peak bucket count is
below `SAMPLE_MATCH_PEAK_BUCKET_MIN` MUST be dropped from the
returned set.

#### Scenario: Stage 2 peak bucket count is the returned score

- **WHEN** the matcher runs against a sample with K matching hashes
  to candidate preview P, of which J fall in the dominant Δt bucket
- **THEN** the returned row for P has `match_score = J` and the
  rows are ordered by `match_score DESC`

#### Scenario: Sub-threshold peak bucket drops the candidate

- **WHEN** `SAMPLE_MATCH_PEAK_BUCKET_MIN=5` and a candidate's peak
  bucket count is `3`
- **THEN** the candidate is not present in the returned rows
