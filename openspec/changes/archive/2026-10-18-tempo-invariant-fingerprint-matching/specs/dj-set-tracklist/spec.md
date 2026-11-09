## ADDED Requirements

### Requirement: Set fingerprints MUST be extracted locally with the production extractor

`analyser/fingerprint_set.py` MUST extract Panako fingerprints for a local
audio file (or a URL downloaded with `yt-dlp` when available) using the same
extractor as preview fingerprinting, and write them as JSON
(`{ source, durationSeconds, fingerprints: [{hash, position}] }`).

#### Scenario: Local file

- **WHEN** `python analyser/fingerprint_set.py set.wav -o set.fps.json` runs
- **THEN** `set.fps.json` holds every extracted `(hash, position)` with
  positions in seconds from the start of the file

#### Scenario: URL without yt-dlp installed

- **WHEN** a URL is given and `yt-dlp` is not on PATH
- **THEN** the script exits non-zero with a message telling the user to
  install `yt-dlp` or pass a local audio file

### Requirement: The tracklist builder MUST match windows against production read-only

`packages/back/scripts/dj-set/tracklist.js` MUST slice the set fingerprints
into overlapping windows and run the shared tempo-aware matcher for each
window, keeping every candidate above the peak floor and caching window
results locally. The preview fingerprint rows sharing a hash with the set
MUST be copied from `DATABASE_URL` inside a read-only session into a local
mirror database, and the windows MUST be matched against the mirror.

#### Scenario: Read-only session

- **WHEN** the builder connects to `DATABASE_URL`
- **THEN** every query there runs with `default_transaction_read_only = on`
  and the builder aborts if the session is not read-only

#### Scenario: Cached rerun

- **WHEN** the builder is rerun with the same set and matcher parameters
- **THEN** no hash is fetched from `DATABASE_URL` again and no window is
  matched again

### Requirement: Stitching MUST recognise overlapping tracks

Window detections MUST be chained per track by consistent tempo factor and
global offset, so a track is reported as one play even while another track
plays at the same time; each play reports start, end, track, tempo factor and
score.

#### Scenario: Two tracks in a transition

- **WHEN** windows covering a transition contain detections for both the
  outgoing and the incoming track
- **THEN** both tracks appear in the tracklist with overlapping intervals

### Requirement: Plays MUST be accepted on significance, not window score sums

Each stitched candidate MUST be re-scored over its whole span with every set
fingerprint counted once, at the tempo factor (within the matcher range) whose
strongest offset segment is largest. A play MUST be accepted only when the
Poisson chance of that segment, given the candidate's own pair count and
offset spread, is below 10^-10 (configurable); at most 3 plays MAY sound at
once; a weaker play overlapping a stronger one and sharing at least 20 % of
its aligned set fingerprints MUST be reported as an alternate of it.

#### Scenario: Shared drum break

- **WHEN** a preview matches the set only through a break that repeats every
  bar
- **THEN** the repetitions count once and the candidate is not reported
  unless it is significant on its own

#### Scenario: Remaster of the playing track

- **WHEN** a remaster of the playing track is also detected over the same
  stretch of the set
- **THEN** it is listed as an alternate of the play, not as another play

### Requirement: Evaluation MUST report recall and precision against ground truth

`packages/back/scripts/dj-set/evaluate.js` MUST compare a tracklist with a
ground-truth file and report recall (over plays whose native played range
overlaps their preview window), precision, start-time error and tempo-factor
error. `truth-from-akin.js` MUST build that ground truth from a
track-feature-extractor render's `timeline_snapshot`, mapping tracks to
production `track_id`s.

#### Scenario: Evaluate a render

- **WHEN** the evaluator runs with a tracklist and its ground truth
- **THEN** it prints per-track hit/miss lines and the aggregate metrics

#### Scenario: Layered tracks and beat jumps

- **WHEN** the render's set has enabled layers (`set_layer`), beat jumps
  (`set_beat_jump`) or tracks entered and left on the same cue
- **THEN** the ground truth places each play from the catalog as the render
  did (layer source cue pinned to the backbone cue plus offset, beat-locked,
  audible where its volume lanes are above zero; tracks audible across the
  transition regions around them; beat-jumped time mapped back to the
  original track), lists the original track ranges played, and computes
  their preview overlap; layers count in recall like other plays and a
  tracklist play matching them is not a false positive
