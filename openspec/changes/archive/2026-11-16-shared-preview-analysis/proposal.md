# Proposal

## Why

Each preview the backend's `prefetchPreviewAudio` job stores is downloaded
from the bucket and decoded to WAV three times, once by each analyser
worker: fingerprints (`panako_processor.py`), embeddings (`main.py`) and
waveforms (`waveform.py`). Measured on the analyser's Python 3.13 setup, a
decode costs 0.4 s of CPU for a two-minute preview and 1.2 s for a six-minute
Bandcamp track, against 1.7 s / 4.1 s for the embedding itself, so about a
third of the embedding worker's CPU goes into decoding again what another
worker already decoded. The three workers also pick previews from three
differently ordered queues, so one preview's stored file waits in the bucket
until the slowest of them reaches it.

## What Changes

- New backend endpoint `GET /admin/preview-analysis?limit=N&model=M`: stored
  previews that still need an analysis, newest first (the order the prefetch
  job stores them), each with `needs_fingerprint`, `needs_embedding` and
  `needs_waveform`.
- New worker `analyser/analyse_previews.py`: downloads and decodes each
  stored preview once, runs the analyses it still needs at the same time on
  the shared WAV (embedding and waveform in one process each, fingerprints
  on `--fingerprint-workers` processes in small Panako batches), and deletes
  the WAV as soon as all of them are done. A byte budget
  (`--max-decoded-mb`, default 1024, and `--max-in-flight`, default 16) bounds the decoded files on disk.
- `analyse_all.sh --previews` runs this one worker (window
  `analyse-previews`) instead of the three preview windows. With
  `--direct-download`, or `--separate-workers`, it runs the three separate
  workers as before.
- Code shared by `main.py` and the new worker moves into modules:
  `embedding_sanity.py` (the duplicate-embedding check) and
  `analysis_reports.py` (batched reports with per-entry fallback).
- No change to how an embedding, fingerprint or waveform is computed: the
  shared WAV is the same file each worker decoded before, and fingerprints
  still read at most `PREVIEW_MAX_DURATION_S` of it.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `analyser-orchestration`: `--previews` runs one combined preview worker
  over a combined queue; the separate workers remain for direct downloads.

## Impact

- **Backend:** one read-only query and route in `routes/admin`; no schema
  change.
- **Analyser:** new `analyse_previews.py`, `analysis_stages.py`,
  `embedding_sanity.py`, `analysis_reports.py`; `main.py` imports the moved
  code; `analyse_all.sh`, `README.md`.
- **Not in scope:** audio-sample fingerprinting, `--direct-download` and the
  Bandcamp drain scripts, which keep their workers.
