# Tasks

## 1. Backend queue

- [x] 1.1 Add `queryPreviewsToAnalyse(limit, model)` next to `analysedCondition` in `routes/admin/preview-audio.js` and `GET /admin/preview-analysis` in `routes/admin/api.js`; test the flags, ordering and exclusions in `test/tests/jobs/prefetch-preview-audio.js`.

## 2. Shared analyser modules

- [x] 2.1 Move `EmbeddingSanityChecker` to `analyser/embedding_sanity.py` and the batched report with per-entry fallback to `analyser/analysis_reports.py` (generalised to any endpoint); `main.py` imports them, no behaviour change; existing `main.py` tests stay green.

## 3. Combined worker

- [x] 3.1 Add `analyser/analysis_stages.py`: spawn-safe stage functions (embedding with a per-process model, waveform render + upload, fingerprint chunk with a fresh Panako cache and the duration cap by truncation), with a test that the truncated WAV equals `to_wav(..., max_seconds=…)`.
- [x] 3.2 Add `analyser/analyse_previews.py`: coordinator (fetch, download + decode threads, dispatch to stage pools, byte/count backpressure, WAV deletion when all stages are done, report flushing, failure handling, `--loop`/`--idle-wait`).
- [x] 3.3 Test it end to end against a stub backend with a stub Panako and fake bucket: one download per preview, only needed stages run, results equal the separate workers', WAVs deleted, budget respected, exit codes.

## 4. Orchestration and docs

- [x] 4.1 `analyse_all.sh`: `analyse-previews` window by default, three windows with `--direct-download` or `--separate-workers`.
- [x] 4.2 `analyser/README.md`.
- [x] 4.3 Analyser tests and the backend suite green.
- [x] 4.4 Add `analyser/bench_preview_workers.py` comparing the separate and combined workers on the same data (time, downloads, peak disk).

## Workflow follow-up

- Archive the change after merge.
- On the analyser host: run `bench_preview_workers.py --real-panako` (with no live workers) and one `analyse_all.sh --previews` session, and compare previews per hour with the separate workers.

## Verification notes

- 1.1: `prefetch-preview-audio.js` 31 passed against Postgres 16 + pgvector (flags per store, newest first, analysed / missing / unstored previews left out, model-specific embedding check, limit).
- 2.1: `test_main_previews`, `test_main_timeouts`, `test_main_audio_samples` unchanged and green after the move.
- 3.1: a full decode truncated with `capped_wav` is frame-identical to `to_wav(..., max_seconds=2)`.
- 3.3: `test_analyse_previews` 4 passed: each preview downloaded once; fingerprints only for previews needing them and read up to the cap; embeddings equal `embedding.embed_file` (cosine ≥ 0.9999); too-short preview reported missing; waveforms only for Bandcamp previews needing them; work directory empty afterwards; `--max-in-flight 1` keeps one download at a time; `--loop` drains and exits 2; empty queue exits 2.
- 4.1: `analyse_all.sh` dry run with a stand-in `tmux`: `--previews` starts `analyse_previews.py --loop --idle-wait 120 -m …`; `--separate-workers` and `--direct-download` start the three workers; `--score-after` warns it is ignored.
- 4.3: analyser `pytest test_*.py` 75 passed, 4 skipped (no pydub, IPv6 or Panako here); backend `yarn test` 744 passed, 0 failed, against a local Postgres 16 + pgvector.
- 4.4: `bench_preview_workers.py --previews 16 --tracks 8` on 4 CPUs (real embeddings and waveforms, Panako stand-in burning 1 s per run plus the given CPU per second of audio):

  | Panako CPU per audio second | separate | combined | downloads | peak audio on disk |
  |---|---|---|---|---|
  | 0.005 s | 89.8 s | 73.2 s | 56 → 24 | 1316 → 678 MB |
  | 0.02 s | 100.5 s | 87.0 s | 56 → 24 | 1316 → 677 MB |
  | 0.06 s (fingerprints the bottleneck) | 163.1 s | 153.1 s | 56 → 24 | 1322 → 677 MB |
