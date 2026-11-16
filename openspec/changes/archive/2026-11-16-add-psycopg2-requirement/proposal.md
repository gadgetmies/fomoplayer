# Proposal

## Why

`analyser/run_fingerprint_and_report.py` connects to Postgres with
`psycopg2`, but `analyser/requirements.txt` has never listed it. A venv built
from the requirements cannot import that script, and its test in
`test_parallel_preview_fingerprinting.py` fails with
`ModuleNotFoundError: No module named 'psycopg2'` until `psycopg2-binary` is
installed by hand (found while verifying `replace-pydub-with-ffmpeg`).

## What Changes

- Add `psycopg2-binary==2.9.10` to `analyser/requirements.txt`.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. Dependency declaration only; the change sets `skip_specs: true`.

## Impact

- `analyser/requirements.txt` only. The binary wheel needs no system
  `libpq` or compiler on the analyser host.
