## Why

The similarity search, the cart search groups and the Fit score all rest on `discogs_multi_embeddings-effnet-bs64-1`
mean embeddings, but nothing has been measured about what that model treats as similar. Nor has anyone checked that
the mean is the best way to represent a track. Without that the results cannot be explained or trusted, and later
work on fine-tuning (design D) has nothing to aim at. The approved design is
`docs/superpowers/specs/2026-10-14-effnet-perception-research-design.md`.

## What Changes

- **Research tooling.** New Python tooling under `analyser/research/effnet-perception/`. It reads full tracks and the
  Traktor beat grid from the AKIN catalog, read-only, and computes per-patch EffNet embeddings with the analyser's
  model.
- **Part 1, track representations.** A descriptive comparison of track representations:
  - mean, median, mean ⊕ std;
  - centred and whitened;
  - short sections and phrase-aligned sections;
  - several vectors per track;
  - stem embeddings;
  - Discogs style probabilities.

  The comparison also picks the audio unit for Part 2.
- **Part 2, audio changes.** Each change is measured as a normalised shift plus self-retrieval:
  - tempo and key;
  - quality and mix;
  - structure;
  - stem removal and solo;
  - stem swaps between tracks;
  - stem offsets.
- **Part 3, what explains closeness.** Correlations of distance with BPM, key, genre, label, artist and energy;
  linear probes; a literature review.
- **Deliverables.** `FINDINGS.md` in this change and a local listening page. All audio, embeddings and tables are
  written to `/Volumes/DJ/research/effnet-perception/`.
- No production code, API or database changes.

## Capabilities

### New Capabilities
- `effnet-perception-research`: the research run. It covers:
  - the inputs it reads and their read-only handling;
  - the representations, audio changes and measures it computes;
  - resumability and failure reporting;
  - the findings and listening-page outputs.

### Modified Capabilities
None.

## Impact

- **Code.** New `analyser/research/effnet-perception/` with its own `requirements.txt` and pytest tests. The existing
  analyser is not changed.
- **Dependencies.** The research venv adds essentia-tensorflow, numpy, scipy, scikit-learn and soundfile. It also uses
  these command-line tools: ffmpeg, rubberband, sox, and Demucs (`htdemucs`) for stems. The optional style
  probabilities need the `discogs-effnet-bs64-1` model, fetched under its own licence terms and not committed.
- **Data.** Reads `/Volumes/DJ/AKIN/tracks.akincatalog` (the live AKIN database), opened read-only. Writes only
  under `/Volumes/DJ/research/effnet-perception/`.
- **Machine.** Several hours of CPU and GPU on the M2 Pro. Runs niced beside the analyser's tmux jobs.
