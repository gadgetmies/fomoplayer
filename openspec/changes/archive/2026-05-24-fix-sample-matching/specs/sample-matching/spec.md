## ADDED Requirements

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
(`design.md` Decision 0) showed that `mantra_rec` is a time-stretched
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
scoring-stage fix is the one taken (Decision 0 = scoring in
`design.md`). If Decision 0 selects extraction or upload, this
requirement is documented as "not applicable" and the corresponding
scenarios are omitted.

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
