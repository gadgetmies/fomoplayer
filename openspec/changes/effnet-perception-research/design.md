## Context

The approved design is `docs/superpowers/specs/2026-10-14-effnet-perception-research-design.md`; read it first. This
document records the technical choices for the tooling.

Inputs:
- **AKIN catalog** (`/Volumes/DJ/AKIN/tracks.akincatalog`), a live SQLite database written by the AKIN app (WAL). It
  holds:
  - `track` (path, BPM, key, genre, label, energy);
  - `track_beat_grid` (`first_beat_ms`, `bpm`);
  - `crate` / `crate_track`;
  - `track_embedding`, a sqlite-vec `vec0` table of 1280-d means from AKIN's ONNX port of the same model.
- **Tools on the machine:**
  - the analyser venv with `essentia-tensorflow` (Python 3.12);
  - `ffmpeg`, `rubberband`, `sox`;
  - a `demucs` CLI;
  - torch and Demucs in `../dj-automation/.venv`.
- **Reference renderer:** the bar-aligned stem mashup renderer in `../dj-automation-stem-mashup-augmentation/
  cue_model/mashup/` (`render.py`, `stretch.py`, `levels.py`, `stems_io.py`).
- **Machine:** M2 Pro with 32 GB. The system disk has ~12 GB free and `/Volumes/DJ` ~346 GB. The analyser's tmux jobs
  (`fingerprint-previews`, `waveforms`) keep running in the background.

## Goals / Non-Goals

**Goals:**
- Steps that are reproducible and can be resumed, producing the Part 1–3 tables, `FINDINGS.md` and a listening page.
- Every audio change verified to be what it claims before its embedding is trusted.

**Non-Goals:**
- Changing the production search, the analyser, or any stored embeddings.
- Deciding which representation is "better". Part 1 is descriptive by the user's choice.
- Beatport preview downloads.

## Decisions

### Layout: one package, one CLI, one directory per step
`analyser/research/effnet-perception/` holds an `epr` package and `python -m epr <step>`. The steps are `sample`,
`embed-full`, `representations`, `stems`, `changes`, `swaps`, `offsets`, `correlations`, `report` and `page`.

Each step writes `<out>/<step>/`:
- `results.csv` (or `.npy` per item);
- `failures.csv`;
- `summary.json`.

A `done/` marker per item makes reruns skip finished work.

*Alternative considered:* a notebook. Rejected because it cannot resume and leaves no failure record.

### Embedding: essentia-tensorflow `.pb`, recomputed
Parts 1 and 2 use `TensorflowPredictEffnetDiscogs` with the analyser's `.pb`, so the numbers are directly comparable
with the production preview embeddings. Part 3 reuses AKIN's stored means, decoded from `vec0` chunks. Those are
correlation inputs only, and a parity check on 20 tracks (cosine ≥ 0.99) runs before they are used.

*Alternative considered:* AKIN's ONNX port. It is faster, but it would add a second pipeline to Parts 1 and 2.

### Audio decoding
`ffmpeg` decodes to float32 16 kHz mono as `(L+R)/2`. Summing with `-ac 1` would make the audio about 1.4× louder;
AKIN documents a cosine drop to ~0.98 from that. Stems are made at 44.1 kHz stereo from the original file, then
downmixed in the same way.

### Stem separation
The `demucs` CLI runs with `-n htdemucs` on MPS (`-d mps`) and `--float32`, one track at a time. Stems are cached per
track in `<out>/stems/<track_id>/`. The 17 tracks that already have `htdemucs` stems in AKIN reuse them.

### Changes
| Change | Tool |
|---|---|
| Time-stretch, pitch shift | `rubberband` (`-t`, `-p`, `--fine`) |
| Varispeed | resampling |
| Codecs | `ffmpeg` (libmp3lame CBR, aac) |
| Filters, EQ, compression, reverb | `sox` |
| Mono, width, noise, bar shuffle, reverse | numpy |

Every change has a verifier:
- pitch: the cross-correlation of the chroma (or the CQT) shifted by the requested semitones;
- tempo: the duration ratio;
- filters: the band-energy ratio;
- codecs: the bitrate from ffprobe.

A change that fails its verifier is recorded as a failure.

### Stem swaps: adapt, do not import
The bar-aligned cut, the rubberband stretch to the host BPM and the level match (donor stem RMS = host stem RMS over
the busiest 32 bars, ±12 dB cap) are re-implemented in about 150 lines, following `cue_model/mashup`. A header comment
names the source path and commit. Importing would tie the research to another repo's internals and its venv. Swaps
are drawn within ±15 % BPM (half and double time folded) to keep stretching mild.

### Normalised shift
shift = cos_dist(changed, original) / cos_dist(original, 10th NN in the reference set). The reference set is the Part 1
sample embedded with the same unit. For stem offsets the "original" is the unshifted recombination.

### Units and sizes
| Part | Size |
|---|---|
| Part 1 | 500 tracks |
| Part 2 | 300 tracks × ~40 changes |
| Swaps | 200 host and donor pairs × 3 layers |
| Offsets | 50 tracks × 3 layers × 4 offsets |
| Part 3 | all stored means |

Jobs run with `nice -n 10` and ≤ 4 workers beside the analyser's tmux jobs.

### Style probabilities
Optional. If `discogs-effnet-bs64-1.pb` (with its `.json`) is in `analyser/models/`, the
`genre_discogs400-discogs-effnet-1` head runs on its embeddings; otherwise the representation is reported as skipped.
Model files are not committed.

### Outputs and privacy
`FINDINGS.md` in the change holds aggregate numbers, charts (PNG saved next to it) and conclusions. It holds no track
titles beyond a few illustrative examples. The listening page (`<out>/page/index.html`, built with lavish-axi
conventions) and all audio stay on `/Volumes/DJ`.

## Risks / Trade-offs

- **The AKIN database is being written while we read it** → open with `mode=ro` and use short queries; snapshot the
  sample's rows to `<out>/sample/tracks.csv` once.
- **Demucs time and memory on full tracks** → MPS, one process, stems cached; if needed, separate only the Part 2 unit
  window plus a margin.
- **Stem separation artefacts get confused with real effects** → offsets are measured against the unshifted
  recombination, and the separation loss is reported separately.
- **Beat grids are incomplete (2,222 tracks at writing)** → grid tests draw only from tracks that have a grid; the
  sample counts are reported.
- **Rubberband artefacts at large ratios** → ratios stay within ±8 % tempo and ±3 semitones; swaps within ±15 % BPM.
- **CPU contention with the analyser jobs** → nice, limited workers, and resumable steps.

## Open Questions

- None blocking. If no section qualifies as the Part 2 unit, Part 2 runs on full tracks and takes longer. That is
  recorded in the summary.
