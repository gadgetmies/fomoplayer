## ADDED Requirements

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
