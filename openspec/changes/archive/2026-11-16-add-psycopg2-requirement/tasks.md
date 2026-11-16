# Tasks

## 1. Declare the dependency

- [x] 1.1 Add `psycopg2-binary==2.9.10` to `analyser/requirements.txt`; verify a fresh Python 3.13 venv from it imports `run_fingerprint_and_report` and `pytest test_parallel_preview_fingerprinting.py` passes without installing anything else.

## Workflow follow-up

- Archive the change after merge.

## Verification notes

- 1.1: fresh Python 3.13 venv from `requirements.txt` imports `run_fingerprint_and_report`; analyser tests 21 passed, 2 skipped (Panako integration tests need `panako` on PATH). `audioop-lts` was also installed only because this branch still has pydub; `replace-pydub-with-ffmpeg` removes that need.
- Merge boundary: full backend suite (`yarn test`) 667 passed, 0 failed, against a local Postgres 16 + pgvector 0.6.0 test database.
