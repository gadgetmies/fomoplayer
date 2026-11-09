## Why

The analyser's production fingerprint worker and the eval-style
fingerprint+report script download mp3 previews/samples into
`analyser/downloads/`, convert each to wav alongside the mp3, and
never delete either. Disk usage has grown to 8.2 GB across
6,654 mp3 files plus their wav conversions, and the report script
additionally leaves behind stale per-PID Panako cache directories
(`analyser/panako_db_worker_<pid>/`, ~130 MB accumulated). Left
unchecked, the analyser eventually fills the host's disk.

## What Changes

- Add `cleanup_downloads(downloads_dir)` to `analyser/extraction.py`
  that removes every regular file directly under the downloads
  directory, leaving subdirectories untouched.
- Add `cleanup_panako_worker_dirs(analyser_root)` to
  `analyser/extraction.py` that removes every
  `panako_db_worker_*/` top-level directory under the analyser root.
- Wrap the main loop of `analyser/panako_processor.py` in
  `try/.../finally: cleanup_downloads(downloads_dir)` so every
  invocation (one per batch in the tmux loop) leaves `downloads/`
  empty on exit.
- Wrap `main()` of `analyser/run_fingerprint_and_report.py` in
  `try/.../finally:` that calls `cleanup_downloads(...)` AND
  `cleanup_panako_worker_dirs(...)` after the
  `ProcessPoolExecutor` has shut down — never inside a worker.
- **BREAKING (analyser-internal):** simplify
  `download_and_manage_file` in `analyser/extraction.py` — drop
  the hash-compare branch, the rename-with-counter branch, and the
  `needs_reprocess` return value. The function now returns just the
  file path. Update call sites in `panako_processor.py` and
  `run_fingerprint_and_report.py` accordingly and drop the
  now-dead `if needs_reprocess: print(...)` log lines.
- Both cleanup helpers are error-tolerant: per-entry failures are
  caught and counted; the helpers never raise into the caller's
  `finally:` block, and print a one-line summary
  (`[cleanup] downloads/: removed N files, M errors`, etc.).
- `eval/extraction.py`, `analyser/main.py`, `analyser/waveform.py`,
  and `analyse_all.sh` are NOT modified. The shared
  `analyser/panako_db/` cache is NOT touched.

## Capabilities

### New Capabilities

- `analyser-disk-cleanup`: Disk-hygiene contract for the analyser
  worker scripts that download audio into `analyser/downloads/`
  and spawn per-PID `panako_db_worker_*/` caches. Specifies which
  directories MUST be empty on invocation exit, which scripts
  MUST enforce that, error-tolerance behavior of the cleanup
  helpers, and the simplified `download_and_manage_file` contract
  that depends on the start-of-run empty-dir invariant.

### Modified Capabilities

<!-- None. The `sample-matching` capability covers matcher behavior, not analyser disk hygiene; no requirements there change. -->

## Impact

- **Code:** `analyser/extraction.py` (two new helpers, one
  simplified function), `analyser/panako_processor.py` (try/finally
  wrap, call-site update, dropped dead branches),
  `analyser/run_fingerprint_and_report.py` (try/finally wrap,
  call-site updates).
- **Operational:** First post-deploy invocation of
  `panako_processor.py` reclaims the existing 8.2 GB in
  `analyser/downloads/`. First post-deploy invocation of
  `run_fingerprint_and_report.py` reclaims the ~130 MB of stale
  `panako_db_worker_*/` directories. No operator action required.
- **Eval extractor:** `eval/extraction.py` shares
  `analyser/downloads/` and uses it as a content-addressed cache;
  production cleanup may evict its entries. Acceptable because the
  cache is already best-effort (callers default to
  `cache_dir=None`); on miss it re-downloads. No regression.
- **Concurrency:** documented as "do not run
  `panako_processor.py` and `run_fingerprint_and_report.py`
  simultaneously" — the late arriver's cleanup may delete the
  other's in-flight files. Not guarded with a lockfile.
- **Dependencies:** none added.
- **APIs:** none changed (analyser is a CLI worker, not an API
  surface).
