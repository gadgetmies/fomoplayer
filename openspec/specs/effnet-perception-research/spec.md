# effnet-perception-research Specification

## Purpose
Research tooling and outputs that measure what the Discogs-EffNet multi embedding treats as similar (representations, audio changes, stems, catalog correlations), read-only on the AKIN catalog. Findings: `openspec/changes/archive/2026-10-17-effnet-perception-research/FINDINGS.md`.
## Requirements
### Requirement: Read-only inputs
The research tooling SHALL open the AKIN catalog read-only and SHALL NOT write to it, to production, or to any path
outside the configured output directory (default `/Volumes/DJ/research/effnet-perception/`).

#### Scenario: Catalog opened read-only
- **WHEN** any research step reads track paths, metadata, crates, beat grids or existing embeddings
- **THEN** the catalog is opened with a read-only SQLite URI (`mode=ro`) and a write attempt raises an error

#### Scenario: Outputs stay in the output directory
- **WHEN** a step writes audio, embeddings or result tables
- **THEN** every written path is under the output directory

### Requirement: Reproducible sampling
Track samples SHALL be drawn with a fixed seed, stratified by AKIN crate and genre. They SHALL exclude:
- missing files;
- tracks shorter than 60 s;
- for grid-dependent tests, tracks without a beat grid.

#### Scenario: Same seed, same sample
- **WHEN** the sampler runs twice with the same seed against the same catalog
- **THEN** it returns the same track ids in the same order

### Requirement: Per-patch embeddings with the analyser's model
Embeddings SHALL be computed from mono 16 kHz audio with `TensorflowPredictEffnetDiscogs` and
`discogs_multi_embeddings-effnet-bs64-1.pb`, giving a `(patches, 1280)` matrix per audio item.

#### Scenario: Embedding a section
- **WHEN** a 30 s section is embedded
- **THEN** the result has 1280 columns and one row per ~2 s patch, and is stored as `.npy` keyed by item id

### Requirement: Track representation comparison
Part 1 SHALL compute these representations for the Part 1 sample and compare each against the mean:
- mean, median, mean ⊕ std;
- centred and PCA-whitened mean;
- 30 s and 60 s sections, picked at a fixed position, as the most typical window, and as the loudest section;
- phrase-aligned sections of 16 and 32 bars;
- multi-vector (k-means centres);
- weighted stem embeddings;
- Discogs style probabilities, when that model is present.

For each representation it SHALL report:
- top-10 neighbour overlap;
- pairwise-distance rank correlation;
- what changed neighbours have in common;
- the largest disagreements.

#### Scenario: Representation report
- **WHEN** Part 1 finishes
- **THEN** a table lists every representation with its mean top-10 overlap with the mean, its rank correlation, and
  the median BPM difference, key distance and shared-genre rate of its neighbours that differ from the mean's

#### Scenario: Optional model missing
- **WHEN** the style-probability model file is absent
- **THEN** that representation is reported as skipped with the reason, and the others still run

### Requirement: Unit selection for audio changes
Part 1 SHALL pick the Part 2 unit: the shortest section method that keeps on average at least 7 of the full-track
mean's 10 nearest neighbours. If no method qualifies, the unit SHALL be the full track.

#### Scenario: A section qualifies
- **WHEN** the 30 s most-typical section keeps 7.4 of 10 neighbours on average and is the shortest qualifying method
- **THEN** Part 2 runs on that section and the choice is recorded in the run summary

### Requirement: Audio changes and their measures
Part 2 SHALL apply the tempo/key, quality/mix, structure and stem changes from the design to the Part 2 sample. For
each changed item it SHALL record:
- the cosine distance to the original;
- that distance divided by the original's distance to its own 10th nearest neighbour in the reference set;
- whether the original is the changed item's nearest neighbour in the reference set.

#### Scenario: Shift recorded
- **WHEN** a +2 semitone pitch shift of a track is embedded
- **THEN** its row records the change name, the parameters, the cosine distance, the normalised shift and the
  self-retrieval flag

#### Scenario: Change verified
- **WHEN** a pitch shift, time-stretch or filter is generated
- **THEN** the generated audio is checked against the request: the measured pitch ratio, the duration ratio, or the
  spectral energy above or below the cut-off, within tolerance

### Requirement: Stem swaps
The tooling SHALL render mashups in which a donor's drums, bass or musical layer (other + vocals) replaces the
host's. The donor is stretched to the host tempo, cut on bar lines and levelled to the host's same stem. Each mashup
SHALL report its position between host and donor as d(mashup, host) / (d(mashup, host) + d(mashup, donor)).

#### Scenario: Swap position
- **WHEN** a mashup with the donor's drums is embedded
- **THEN** its row records the host, donor, swapped layer, the host and donor distances and the position value

### Requirement: Stem offsets
The tooling SHALL recombine a track's stems without a shift and measure that against the original (separation loss).
It SHALL then shift one layer by 1/16 note, 1 beat, 1 bar and an off-grid amount, and measure each version against
the unshifted recombination.

#### Scenario: Unshifted recombination
- **WHEN** the four stems are summed without a shift
- **THEN** the sum matches the mix within the separation tolerance, and its embedding distance to the original is
  recorded as the separation loss

#### Scenario: Offset shift measured against recombination
- **WHEN** the drums are shifted by one beat
- **THEN** the shift is measured against the unshifted recombination, not against the original

### Requirement: Correlations and probes
Part 3 SHALL relate pairwise distances of AKIN mean embeddings to BPM difference, Camelot key distance, shared genre,
label and artist, and energy difference. It SHALL also train cross-validated linear probes from the embedding to BPM,
key and genre.

#### Scenario: Probe report
- **WHEN** Part 3 finishes
- **THEN** the report lists each probe's cross-validated score next to a chance baseline

### Requirement: Resumable runs with recorded failures
Each step SHALL store its results per item and skip items already done. A failing item SHALL be recorded with its
error in the step's `failures.csv` and counted in the step summary, and SHALL NOT be silently skipped.

#### Scenario: Rerun after interruption
- **WHEN** a step is rerun after being stopped midway
- **THEN** finished items are skipped and only the remaining items are processed

#### Scenario: One track fails
- **WHEN** decoding one track raises an error
- **THEN** the step continues with the other tracks, `failures.csv` has a row with the track id and error, and the
  step exits non-zero

### Requirement: Findings and listening page
The run SHALL produce `FINDINGS.md` in this change, with charts and a "what the model listens to" summary, and a
local listening page. The page SHALL hold:
- the originals and their changes;
- the stem swaps and offsets;
- Part 1's largest disagreements, as a plain track list.

Personal audio and track lists SHALL stay out of the repository.

#### Scenario: Listening page
- **WHEN** the page is opened from the output directory
- **THEN** each example plays its local audio, and each changed version sits next to its original

