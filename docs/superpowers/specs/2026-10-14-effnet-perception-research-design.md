# What Discogs-EffNet hears: perception research (design B)

Date: 2026-10-14
Status: approved design, input for the OpenSpec change `effnet-perception-research`

## Purpose

Understand and explain what `discogs_multi_embeddings-effnet-bs64-1` treats as similar, so the similarity search, the
cart search groups and the Fit score can be trusted and explained. This is research: the output is findings and a
listening page, not a product change. It also informs design D (fine-tuning), but D's needs do not set its scope.

Two open questions are part of it:

- The search uses the **mean** of the per-patch embeddings. That it is the best track representation has never been
  checked.
- Which audio properties move the embedding: tempo, key, sound quality, mix, structure, or which stems.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Audio source | Full tracks from the AKIN catalog (`/Volumes/DJ/AKIN/tracks.akincatalog`), ~7,880 tracks | Every track usable, lossless subset, no downloads, disk space on `/Volumes/DJ` |
| Beatport previews | Not used | A section cut from the full track does the same job. Preview quality is tested as an audio change (re-encoding) instead |
| Judging representations | Descriptive only; no "tracks that belong together" ground truth | Chosen by the user. Part 1 shows how representations differ and why, the user judges by ear |
| Unit for audio changes | A short section if it keeps the full track's neighbours, else full tracks | Stem separation and changes cost time and disk in proportion to length |
| Output | `FINDINGS.md` with charts plus a local listening page | Chosen by the user |

## Part 1: track representations

All are built from the same EffNet patch embeddings (~2 s patches) of ~500 AKIN tracks spread across crates and
genres.

1. Mean (today's search).
2. Per-dimension median.
3. Mean ⊕ per-dimension standard deviation.
4. Centred on the collection mean; PCA-whitened.
5. One short section, 30 s and 60 s:
   - (a) a fixed position (a third into the track);
   - (b) the most typical window (closest to the track mean);
   - (c) the loudest section.
6. Phrase-aligned sections (16 and 32 bars on the Traktor beat grid), compared section to section, e.g. best
   drop-to-drop match.
7. Several vectors per track: the windows clustered to ~4 centres, tracks compared by their best-matching centres.
8. Stem embeddings: drums, bass and other + vocals embedded separately, combined with weights.
9. The 400 Discogs style probabilities. This needs the sibling model `discogs-effnet-bs64-1`, downloaded under its
   own licence terms (see `analyser/models/README.md`).

**Measures, relative to the mean:**
- top-10 neighbour overlap;
- rank correlation of pairwise distances;
- what changed neighbours have in common: BPM difference, key distance, genre, label, artist and stem similarity;
- the largest disagreements, as listening examples.

No representation is declared "better"; the user judges from the examples.

**Unit decision for Part 2.** The shortest section method from 5 that keeps on average ≥ 7 of the full-track mean's
10 nearest neighbours is used for Part 2. If none does, Part 2 uses full tracks.

## Part 2: audio changes

The changes run on ~300 tracks, on the unit chosen in Part 1. The table lists them by group:

| Group | Changes |
|---|---|
| Tempo and key | Time-stretch ±2/4/8 % (pitch kept); pitch shift ±1/2/3 semitones (tempo kept); varispeed ±4/8 % (both) |
| Quality and mix | MP3 320/192/128/96/64 kbps, AAC 128; low-pass 4/8/12 kHz; high-pass 60/120/250 Hz; ±6 dB EQ on sub, low-mid, presence and air bands; heavy compression and limiting; mono; stereo width ×0/×2; 22.05 kHz resampling; white and vinyl noise at two levels; reverb |
| Time and structure | Bars shuffled along the beat grid; reversed audio |
| Stems | Each of drums, bass, other and vocals removed; each played alone |
| Stem swaps | Host keeps its sections; the donor's drums, bass or musical layer (other + vocals) replaces the host's. Tempo-matched, bar-aligned and level-matched, ~200 host and donor pairs |
| Stem offsets | Stems of one track recombined without a shift (measures what separation loses), then drums, bass or the musical layer shifted by 1/16 note, 1 beat, 1 bar, and an off-grid amount (e.g. 37 ms), ~50 tracks |

**Measures:**
- **Shift:** the cosine distance between the changed and the original version, divided by the distance from the
  original to its own 10th nearest neighbour in the catalogue. 1.0 means the change moves the track as far as its
  10th neighbour.
- **Self-retrieval:** whether the changed version still finds the original as its nearest match among the catalogue.
- **Stem swaps:** where the mashup lands between host and donor, as d(mashup, host) / (d(mashup, host) +
  d(mashup, donor)), reported per swapped layer.
- **Stem offsets:** the shift of each offset version against the unshifted recombination, not against the original.
  This separates the offset effect from the separation loss.

**Stem-swap renderer.** Adapted from `cue_model mashup render` in `../dj-automation`:
- rubberband stretch to the host's tempo;
- cuts on bar lines from the beat grid;
- a donor stem levelled once to the host's same stem over the groove sections.

The adaptation keeps a provenance note naming the source file and commit.

## Part 3: what explains closeness

- **Correlations.** Over pairs of the ~7,880 existing AKIN mean embeddings, relate distance to BPM difference, key
  distance (Camelot), shared genre, label and artist, and energy difference.
- **Probes.** Linear probes from the embedding to BPM, key and genre; the accuracy shows how strongly each is encoded.
- **Embeddings used.** AKIN's embeddings come from its ONNX port of the same model, pinned to the `.pb` graph by
  golden tests. They are only used here; Parts 1 and 2 compute their own.
- **Literature review:**
  - the Discogs-EffNet and MAEST papers and the Essentia model documentation;
  - published results on the pitch, tempo and codec robustness of music audio embeddings;
  - stem-level analyses of music embeddings.

## Run setup

- **Code.** `analyser/research/effnet-perception/` in this repo:
  - Python, using the analyser's `essentia-tensorflow` and `models/discogs_multi_embeddings-effnet-bs64-1.pb`;
  - per-patch embeddings via `TensorflowPredictEffnetDiscogs`;
  - stems with Demucs `htdemucs`, the same model as AKIN;
  - changes with ffmpeg, rubberband and sox or numpy.
- **Data access.** The AKIN catalog is opened read-only (it is the AKIN app's live database). The data used:
  - track paths and metadata;
  - the Traktor beat grid (`track_beat_grid`: `first_beat_ms`, `bpm`; 2,222 tracks at writing, more as Traktor
    analysis finishes);
  - crates for sampling;
  - existing mean embeddings for Part 3.
- **Outputs.** Everything is written under `/Volumes/DJ/research/effnet-perception/`:
  - audio (sections, stems, changed versions), deleted per step once it has been embedded, unless kept for the
    listening page;
  - embeddings as `.npy` per track;
  - result tables as CSV.
  
  Nothing is written to production or to the AKIN catalog.
- **Resumable.** Each step stores results per track and skips tracks already done. A failed track is recorded with its
  error in the step's `failures.csv` and reported in the step summary, never silently skipped.
- **Tracks without a beat grid** are left out of the grid-dependent tests only: phrase sections, bar shuffles, stem
  swaps and offsets.
- **Sampling.** Seeded and stratified by AKIN crate and genre, so reruns use the same tracks.
- **Tests (pytest)** for the parts that could quietly go wrong:
  - a pitch shift measured by chroma or autocorrelation matches the request;
  - a time-stretch changes the duration by the requested factor;
  - the unshifted stem sum matches the mix within tolerance;
  - offsets land on grid positions;
  - stem-swap levels match the host stem's RMS.

## Deliverables

1. `FINDINGS.md` in the OpenSpec change. Charts cover:
   - neighbour overlap per representation;
   - the shift per change (sorted bar chart);
   - stem-swap host/donor positions;
   - offset shifts;
   - probe accuracies.
   
   It ends with a short "what the model listens to" summary and the literature notes.
2. A local listening page (Lavish, served from `/Volumes/DJ/research/effnet-perception/`). Sections:
   - the original next to each change;
   - stem swaps with host and donor;
   - offset versions;
   - Part 1's largest representation disagreements.
   
   A plain track list sits next to any 2D map, and previews auto-advance. The page plays local audio, so it is not
   published as a hosted artifact.

## Out of scope

- Changing the production search or its representation. A follow-up change can do that if the findings justify it.
- Fine-tuning or training (design D) and group formation (design A).
- Beatport preview downloads.
