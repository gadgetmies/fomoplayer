# Tasks

## 1. Backend queue

- [ ] 1.1 Add `queryPreviewsToAnalyse(limit, model)` next to `analysedCondition` in `routes/admin/preview-audio.js` and `GET /admin/preview-analysis` in `routes/admin/api.js`; test the flags, ordering and exclusions in `test/tests/jobs/prefetch-preview-audio.js`.

## 2. Shared analyser modules

- [ ] 2.1 Move `EmbeddingSanityChecker` to `analyser/embedding_sanity.py` and the batched report with per-entry fallback to `analyser/analysis_reports.py` (generalised to any endpoint); `main.py` imports them, no behaviour change; existing `main.py` tests stay green.

## 3. Combined worker

- [ ] 3.1 Add `analyser/analysis_stages.py`: spawn-safe stage functions (embedding with a per-process model, waveform render + upload, fingerprint chunk with a fresh Panako cache and the duration cap by truncation), with a test that the truncated WAV equals `to_wav(..., max_seconds=…)`.
- [ ] 3.2 Add `analyser/analyse_previews.py`: coordinator (fetch, download + decode threads, dispatch to stage pools, byte/count backpressure, WAV deletion when all stages are done, report flushing, failure handling, `--loop`/`--idle-wait`).
- [ ] 3.3 Test it end to end against a stub backend with a stub Panako and fake bucket: one download per preview, only needed stages run, results equal the separate workers', WAVs deleted, budget respected, exit codes.

## 4. Orchestration and docs

- [ ] 4.1 `analyse_all.sh`: `analyse-previews` window by default, three windows with `--direct-download` or `--separate-workers`.
- [ ] 4.2 `analyser/README.md`.
- [ ] 4.3 Analyser tests and the backend suite green.
