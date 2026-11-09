## 1. Promote shared primitives into extraction.py

- [x] 1.1 Move `_worker_cache_dir()` from `run_fingerprint_and_report.py` into `extraction.py` (per-PID isolated `PANAKO_CACHE_FOLDER`)
- [x] 1.2 Move `_batched_panako_store(audio_paths, cache_dir)` into `extraction.py` (one `store` + one `resolve` JVM call, returns parallel list of Panako file IDs)
- [x] 1.3 Move `upload_preview_fingerprints(preview_id, fingerprints)` from `panako_processor.py` into `extraction.py`; keep it import-safe (only `requests` + lazy `auth`)
- [x] 1.4 Re-export the moved names from `panako_processor.py` for backwards compatibility (alongside the existing `extraction.py` re-exports)
- [x] 1.5 Refactor `run_fingerprint_and_report.py` to import `_worker_cache_dir` and `_batched_panako_store` from `extraction.py` instead of defining them locally; confirm its behaviour is unchanged

## 2. Spawn-safe parallel worker

- [x] 2.1 Add top-level `fingerprint_preview_subbatch(jobs)` to `extraction.py`: Phase A per-file download + wav-convert (failures isolated), Phase B `_batched_panako_store` over prepared files in an isolated cache, Phase C per-file `.tdb` read (`read_tdb_file`) + `upload_preview_fingerprints` (per-file try/except). Returns one `{id, fp_count, error}` dict per input job
- [x] 2.2 Verify the worker imports only `extraction.py` + `auth.py` (no `panako_processor.py` import) so it is safe under `spawn`

## 3. Parent pool driver in panako_processor.py

- [x] 3.1 Add `--workers N` arg (default 4) with `--help` noting the recommended ceiling (`cores − 1..2`) and that parallelism is on by default
- [x] 3.2 Replace the serial `for preview in previews_to_process` loop: split the fetched batch into at most `--workers` sub-batches and submit them to a `ProcessPoolExecutor(max_workers=workers)`, collecting results as they complete
- [x] 3.3 Implement parent-driven cumulative `--score-after`: tally successfully-uploaded previews as results return and call `run_server_side_scoring` once each time the cumulative total crosses a multiple of `--score-after`; let workers continue during the POST
- [x] 3.4 Preserve the existing exit-code contract (rc=2 on empty queue) and per-batch progress logging
- [x] 3.5 Leave the `--audio-samples` path serial and unchanged (still uses `extract_panako_fingerprints`)

## 4. Orchestrator flag

- [x] 4.1 Add `--fingerprint-workers N` to `analyse_all.sh` (arg parse + usage text)
- [x] 4.2 Append `--workers N` to the `fingerprint-previews` worker command only when the option is set; leave other worker commands untouched

## 5. Tests

- [x] 5.1 Unit-test `_batched_panako_store` and `fingerprint_preview_subbatch` against the `analyser/data` fixtures with a temp cache dir; assert per-file isolation (one bad file does not drop the others) and that distinct sub-batches use distinct cache dirs
- [x] 5.2 Unit-test the parent driver with a stubbed pool + stubbed upload/scoring: assert cumulative `--score-after` fires at the correct counts (e.g. twice for 2300 uploads at threshold 1000) and that out-of-order results are tallied correctly
- [x] 5.3 Add a regression test confirming `run_fingerprint_and_report.py` still works after importing the promoted helpers

## 6. Verify

- [x] 6.1 Manual run `panako_processor.py --previews --workers 4 --batch-size 40` against a dev queue; confirm distinct per-process caches and throughput scaling via the per-batch logging
- [x] 6.2 Run the full analyser test suite and confirm green
