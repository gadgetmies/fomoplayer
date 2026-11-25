# Tasks

## 1. Worker

- [x] 1.1 `extraction.fingerprint_prepared(..., upload=False)` returns the fingerprints; `analysis_stages.fingerprint_chunk` uses it.
- [x] 1.2 `analyse_previews.py`: upload thread, `--max-queued-uploads`, skip previews awaiting upload when fetching.
- [x] 1.4 `--max-fingerprint-in-flight`: previews needing a fingerprint hold at most that many slots.
- [x] 1.3 Tests in `analyser/test_analyse_previews.py` (slow upload, refetch, failed upload); stub backend upload delay and status in `analysis_fakes.py`.

## 2. Docs

- [x] 2.1 "Combined preview worker" in `analyser/README.md`.
