## ADDED Requirements

### Requirement: Production fingerprint worker MUST leave the downloads directory empty on exit

The `analyser/panako_processor.py` script MUST wrap its main loop
(both the `--audio-samples` and `--previews` branches) in a
`try/.../finally:` block whose `finally:` clause calls
`cleanup_downloads(downloads_dir)`. Cleanup MUST run on every exit
path: successful completion, queue-drained early-exit (`sys.exit(2)`),
and uncaught exceptions raised from within the loop. On exit,
`analyser/downloads/` MUST contain no regular files left over from
this invocation.

#### Scenario: Successful run wipes downloads on exit

- **WHEN** `python panako_processor.py --previews -b 5` runs to
  completion and processes a batch with files written to
  `analyser/downloads/`
- **THEN** after the process exits, `analyser/downloads/` contains
  no regular files at its top level

#### Scenario: Crashed run still wipes downloads

- **WHEN** `panako_processor.py` raises an unhandled exception part
  way through processing a batch (for example, a `panako` subprocess
  failure or an unexpected `KeyError` in the queue payload)
- **THEN** the `finally:` block still calls `cleanup_downloads` and
  `analyser/downloads/` contains no regular files at its top level
  before the process terminates

#### Scenario: Queue-drained early exit wipes downloads

- **WHEN** `panako_processor.py` finds no items in the queue and exits
  with status 2 via `sys.exit(2)`
- **THEN** the `finally:` block still runs and
  `analyser/downloads/` contains no regular files at its top level

### Requirement: Fingerprint+report runner MUST remove downloads and stale Panako worker dirs on exit

The `analyser/run_fingerprint_and_report.py` script MUST wrap its
`main()` body in a `try/.../finally:` block whose `finally:` clause
calls both `cleanup_downloads(downloads_dir)` AND
`cleanup_panako_worker_dirs(analyser_root)`. Both cleanup calls MUST
run in the orchestrator process AFTER the
`ProcessPoolExecutor` used by `_fingerprint_previews_parallel` has
shut down. The helpers MUST NOT be invoked from inside
`_worker_process_preview_batch` or any other worker-process callable.

On exit, `analyser/downloads/` MUST contain no regular files at its
top level, and the analyser root MUST contain no
`panako_db_worker_*/` directories.

#### Scenario: Successful run wipes downloads and worker dirs

- **WHEN** `python run_fingerprint_and_report.py` completes a full
  fingerprint + score + report cycle with multiple parallel workers
  that each created a `panako_db_worker_<pid>/` directory
- **THEN** after the process exits, `analyser/downloads/` has no
  regular files at its top level, and no `panako_db_worker_*/`
  directories exist under the analyser root

#### Scenario: Stale worker dirs from a previous crashed run are also reaped

- **WHEN** the analyser root already contains
  `panako_db_worker_999999/` from a prior crashed invocation, and a
  fresh `run_fingerprint_and_report.py` run completes
- **THEN** the prior stale directory is removed alongside the
  current run's worker dirs, because cleanup matches the
  `panako_db_worker_*` prefix rather than "my pid only"

#### Scenario: Cleanup runs only after the worker pool has shut down

- **WHEN** `run_fingerprint_and_report.py` is mid-flight inside
  `_fingerprint_previews_parallel` and a worker is actively writing
  to its `panako_db_worker_<pid>/` directory
- **THEN** `cleanup_panako_worker_dirs` has NOT yet been invoked,
  because the call sits in the outer `main()` `finally:` after the
  `ProcessPoolExecutor` context manager has joined its workers

### Requirement: Cleanup helpers MUST be error-tolerant and never raise into the caller

Both `cleanup_downloads(downloads_dir)` and
`cleanup_panako_worker_dirs(analyser_root)` in
`analyser/extraction.py` MUST wrap each per-entry removal in a
`try/except` so that a failure on one entry does not abort the
remaining entries. Neither helper MUST raise an exception into the
caller's `finally:` block. Each helper MUST print a one-line summary
of the form `[cleanup] <target>: removed N entries, M errors` to
stdout before returning.

#### Scenario: Unwritable file does not abort cleanup of other files

- **WHEN** `cleanup_downloads` is called on a directory containing
  five regular files where one has been chmod'd to 000 on a POSIX
  filesystem
- **THEN** the four removable files are removed, the call returns
  without raising, and the printed summary reports
  `removed 4 files, 1 errors`

#### Scenario: Locked worker directory does not abort cleanup of other worker dirs

- **WHEN** `cleanup_panako_worker_dirs` is called on an analyser
  root containing `panako_db_worker_111/`, `panako_db_worker_222/`,
  and `panako_db_worker_333/`, and one of them holds a file the
  caller cannot remove
- **THEN** the two removable worker dirs are removed, the call
  returns without raising, and the printed summary reports the
  error count for the third

### Requirement: Cleanup helpers MUST NOT touch protected directories or subdirectories

`cleanup_downloads(downloads_dir)` MUST iterate only the top level
of `downloads_dir` and MUST skip entries that are not regular files
(directories, symlinks to directories, sockets, etc.).
`cleanup_panako_worker_dirs(analyser_root)` MUST match only top-level
entries whose name begins with `panako_db_worker_` and MUST skip
entries that are not directories. In particular, the shared
`analyser/panako_db/` cache MUST NOT be removed by either helper.

#### Scenario: A subdirectory inside downloads is preserved

- **WHEN** `cleanup_downloads(downloads_dir)` is called on a
  downloads directory that contains `preview_1.mp3`,
  `preview_1.wav`, and a subdirectory `archive/` holding
  `preview_old.mp3`
- **THEN** `preview_1.mp3` and `preview_1.wav` are removed, and
  the `archive/` directory and its contents are left untouched

#### Scenario: The shared panako_db directory is not removed

- **WHEN** `cleanup_panako_worker_dirs(analyser_root)` is called on
  an analyser root containing `panako_db/`,
  `panako_db_worker_500/`, and `downloads/`
- **THEN** only `panako_db_worker_500/` is removed; `panako_db/`
  and `downloads/` are left untouched (the `panako_db_worker_`
  prefix match does not extend to `panako_db`)

### Requirement: download_and_manage_file MUST return only the file path

`download_and_manage_file(url, file_id, file_type, filename=None,
downloads_dir=None)` in `analyser/extraction.py` MUST return a
single `str` (the absolute or downloads-dir-relative path of the
final file on disk). It MUST NOT return a tuple, and it MUST NOT
contain a `needs_reprocess` flag in its return value. The function
relies on the start-of-invocation invariant established by
`cleanup_downloads` — that the target path is not present when the
download begins — and therefore MUST NOT contain hash-comparison
logic against pre-existing files, nor rename-with-counter logic
for content-divergent files of the same `(file_type, file_id)`.

Call sites in `analyser/panako_processor.py` and
`analyser/run_fingerprint_and_report.py` MUST update to receive a
single value (e.g. `downloaded_path = download_and_manage_file(...)`)
and any `if needs_reprocess:` branches MUST be removed.

#### Scenario: Function returns a path string, not a tuple

- **WHEN** `download_and_manage_file(url, 42, "preview")` is called
  successfully
- **THEN** the return value is a `str` and `os.path.isfile(result)`
  is `True`

#### Scenario: Failed download removes the temp file and raises

- **WHEN** the underlying `urllib.request.urlretrieve` produces an
  empty file (0 bytes), or the temp file is missing after the call
- **THEN** `download_and_manage_file` removes the temp file if
  present and raises `RuntimeError` describing the empty/missing
  download

#### Scenario: Caller in panako_processor.py uses the simplified return value

- **WHEN** the audio-samples or previews branch of
  `panako_processor.py` calls `download_and_manage_file`
- **THEN** the call site uses
  `downloaded_path = download_and_manage_file(...)` (no tuple
  unpack) and the code path does not reference a `needs_reprocess`
  variable
