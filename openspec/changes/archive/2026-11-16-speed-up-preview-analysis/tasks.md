# Tasks

## 1. Prefetch helper

- [x] 1.1 Add `analyser/prefetch.py` (`ordered(items, prepare, use_store_pool, workers)`) per design.md with `analyser/test_prefetch.py` covering input order, the in-flight bound, serial store items, concurrent bucket items and exceptions surfacing per item; verify with `python -m unittest test_prefetch`.

## 2. Embedding worker

- [x] 2.1 Restructure `main.py`'s preview branch around `prefetch.ordered`: per-track prepare (download with a 60 s timeout, decode to a per-track WAV, delete the MP3), embedding on the main thread, `--download-workers`.
- [x] 2.2 Collect a batch's reports into one `POST /admin/analyse` with per-item fallback, flushed before a sanity-check exit.
- [x] 2.3 Add `--loop` and `--idle-wait` (model built once, exit `2` on empty queue unless `--idle-wait` > 0, 60 s wait after a batch that reports nothing, Bandcamp release cache cleared per batch) and pass both from `analyse_all.sh`.
- [x] 2.4 Add `analyser/test_main_previews.py`: stub backend serving two batches then none; assert one model build, one POST per batch with the expected entries, a vector equal to `embedding.embed_file`'s, exit `2`; plus the fallback on a 500.

## 3. Waveform worker

- [x] 3.1 Use `prefetch.ordered` in `waveform.process_batch` (per-preview MP3/WAV paths, store previews on the single thread, drawing and upload on the main thread), add `--download-workers`, and test it with a stubbed bucket client.

## 4. Docs and verification

- [x] 4.1 Update `analyser/README.md` (`--loop`, `--download-workers`, per-batch reporting).
- [x] 4.2 Run the analyser unit tests green; the change touches no backend code.

## Workflow follow-up

- Archive the change after merge.

## Verification notes

- Python 3.13 venv from `analyser/requirements.txt` (essentia-tensorflow 2.1b6), plus pytest.
- 1.1: `test_prefetch` 6 passed (order, 4 concurrent bucket items, 1 store item at a time, window of `workers + 1`, per-item exceptions, early exit).
- 2.x: `test_main_previews` 4 passed: `--loop` over two batches builds the model once, sends one `POST /admin/analyse` per batch in queue order (embedding, too-short preview reported missing, embedding), vectors match `embedding.embed_file` (cosine ≥ 0.9999), exits `2`; `--idle-wait` keeps asking with the model loaded; without `--loop` one batch; a 500 on the batch report is resent one entry per request. `test_main_timeouts` (stalled download) still passes through the prefetch threads.
- 3.1: `test_waveform_batch` 3 passed: 3 concurrent bucket downloads with `--download-workers 3`, Bandcamp fetches one at a time, reports in queue order, downloads and WAVs deleted.
- 4.2: all analyser tests, `pytest test_*.py`: 69 passed, 4 skipped (no pydub, no IPv6, no Panako on this host). The change touches no backend code; the backend suite (`yarn test`) was not run here (no Postgres + pgvector in this environment).
