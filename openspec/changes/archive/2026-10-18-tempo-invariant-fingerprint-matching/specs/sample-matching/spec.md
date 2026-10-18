## MODIFIED Requirements

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
2. Tempo-aware temporal-coherence rescoring per candidate: for each
   tempo factor `a` in a grid spanning
   `[1 − SAMPLE_MATCH_MAX_TEMPO_DEVIATION, 1 + SAMPLE_MATCH_MAX_TEMPO_DEVIATION]`
   (default deviation 0.08; the grid MUST contain `a = 1`) and each
   matched `(hash, position_sample, position_preview)` row, compute
   `b = position_preview − a · position_sample`, bucket `b` by
   `SAMPLE_MATCH_BUCKET_SECONDS` (default 0.5 s), and take the count
   of the peak `(a, b)` bucket as the candidate's final score. The grid
   step MUST be no coarser than `bucket / span` (span = the sample's
   fingerprint time span) and no finer than 0.0025. The 0.5 s default
   absorbs acoustic-capture clock drift that splits a true peak across
   neighbouring buckets at 0.05 s (production validation 2026-10-11:
   the serious_sound_rec ↔ correct-preview peak rises 8 → 29 at 0.5 s
   while the noise floor stays ≤ 4).

Candidates MUST be ranked by Stage 2's peak-bucket count, not by
Stage 1's overlap. A candidate whose Stage 2 peak bucket count is
below `SAMPLE_MATCH_PEAK_BUCKET_MIN` (default 3) MUST be dropped from
the returned set. The default floor exists to keep peak-count-1/2
noise rows out of the persisted match set while retaining the weakest
known-genuine fixture pair (mantra_rec ↔ mantra_preview, peak 4 at
0.5 s buckets). Each returned row MUST include the peak's tempo factor
(`peak_tempo_factor`) and offset (`peak_offset_seconds`). With
`SAMPLE_MATCH_MAX_TEMPO_DEVIATION=0` the grid MUST be `{1}` and the
scores MUST equal the pre-change slope-1 scorer.

#### Scenario: Stage 2 peak bucket count is the returned score

- **WHEN** the matcher runs against a sample with K matching hashes
  to candidate preview P, of which J fall in the dominant `(a, b)` bucket
- **THEN** the returned row for P has `match_score = J` and the
  rows are ordered by `match_score DESC`

#### Scenario: Sub-threshold peak bucket drops the candidate

- **WHEN** `SAMPLE_MATCH_PEAK_BUCKET_MIN=5` and a candidate's peak
  bucket count is `3`
- **THEN** the candidate is not present in the returned rows

#### Scenario: Time-stretched sample matches at its tempo factor

- **WHEN** a sample's positions are the preview's positions divided by
  1.06 (the sample plays 6 % faster) and the matcher runs with the
  default deviation
- **THEN** the preview is returned with a peak count of at least 95 % of
  the unstretched sample's and `peak_tempo_factor` within 0.005 of 1.06

#### Scenario: Zero deviation reproduces the slope-1 scorer

- **WHEN** `SAMPLE_MATCH_MAX_TEMPO_DEVIATION=0`
- **THEN** every returned row has `peak_tempo_factor = 1` and the same
  `match_score` as bucketing `position_preview − position_sample`
