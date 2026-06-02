# Analyser disk cleanup — design

The analyser's production fingerprint worker and the eval-style fingerprint+report
script download mp3 previews/samples into `analyser/downloads/`, convert each to
wav alongside the mp3, and never delete either. Disk usage has reached 8.2 GB
across 6,654 mp3 files plus their wav conversions. The parallel-worker
report script also creates per-PID Panako cache directories
(`analyser/panako_db_worker_<pid>/`) and never removes them, accumulating
~130 MB across stale workers.

This change wipes both classes of files at the end of each invocation.

## Goals

- Each invocation of `analyser/panako_processor.py` and
  `analyser/run_fingerprint_and_report.py` leaves `analyser/downloads/` and
  `analyser/panako_db_worker_*/` empty on exit, regardless of success or
  failure.
- The first invocation after the fix reclaims the existing 8.2 GB
  automatically; no separate purge command is needed.
- The simplification of `download_and_manage_file` reflects the new
  contract: the downloads dir is empty at start of run, so the
  hash-compare/rename-with-counter caching logic becomes dead and is
  removed.

## Non-goals

- `analyser/panako_db/` (the production shared Panako cache, ~489 MB) is
  **not** touched — it's needed across runs.
- `analyser/eval/extraction.py` is **not** modified. Its content-addressed
  cache (sha256(url) filenames in the same `analyser/downloads/` dir)
  becomes best-effort: a production worker's cleanup may evict it, and the
  next call re-downloads. The cache is already opt-in (callers pass
  `cache_dir=None` by default), so no regression.
- `analyser/main.py` (embedding worker) and `analyser/waveform.py` already
  use `tempfile.TemporaryDirectory()` and clean up; unchanged.
- `analyse_all.sh` is unchanged; the tmux loop already re-invokes the
  worker per batch, which is what triggers per-batch cleanup.

## Scope summary

| Script | Cleanup added? | Notes |
| --- | --- | --- |
| `panako_processor.py` | yes | Wipes `downloads/` in `finally:` at end of `__main__`. |
| `run_fingerprint_and_report.py` | yes | Wipes `downloads/` AND `panako_db_worker_*/` in `finally:` in `main()`, after pool shutdown. |
| `eval/extraction.py` | no | Excluded from cleanup; cache is best-effort. |
| `main.py`, `waveform.py` | no change | Already use `tempfile.TemporaryDirectory()`. |

## Design

### New helpers in `analyser/extraction.py`

Two functions co-located with `ensure_downloads_directory` and
`download_and_manage_file`:

```python
def cleanup_downloads(downloads_dir):
    """Remove every regular file directly under `downloads_dir`.

    - Only touches the top level — subdirectories and their contents stay.
    - Each unlink is wrapped in its own try/except so one bad file does
      not block the rest.
    - Must never raise into the caller's `finally` block — log and
      continue on error.
    - Logs a one-line summary `[cleanup] downloads/: removed N files,
      M errors` at the end.
    """

def cleanup_panako_worker_dirs(analyser_root):
    """Remove every `analyser_root/panako_db_worker_*/` directory.

    - Matches the `panako_db_worker_*` glob at the top level of
      `analyser_root`.
    - `shutil.rmtree(..., ignore_errors=False)` per match, wrapped in
      try/except so one stuck dir does not block the rest.
    - Must never raise into the caller. Logs `[cleanup] worker dirs:
      removed N, M errors`.
    """
```

Both use `os.listdir` + explicit path joins (no recursive globbing) so
they only touch the intended top-level entries.

### Cleanup call sites

**`panako_processor.py`:**

```python
if __name__ == '__main__':
    # ... existing arg parsing ...
    downloads_dir = ensure_downloads_directory()
    try:
        # existing main loop (audio_samples and/or previews)
        ...
    finally:
        cleanup_downloads(downloads_dir)
```

Only the downloads dir is cleaned here — `panako_processor.py` does not
spawn worker pools, so there are no `panako_db_worker_*/` dirs to clean.

**`run_fingerprint_and_report.py`:**

```python
def main():
    args = ap.parse_args()
    conn = db_connect()
    downloads_dir = ensure_downloads_directory()
    analyser_root = os.path.dirname(os.path.abspath(__file__))
    try:
        # existing phase_fingerprint / phase_score / phase_report ...
        ...
    finally:
        cleanup_downloads(downloads_dir)
        cleanup_panako_worker_dirs(analyser_root)
```

Cleanup runs in the orchestrator process **after** the
`ProcessPoolExecutor` in `_fingerprint_previews_parallel` has shut down —
never inside `_worker_process_preview_batch`, so workers can't wipe each
other's in-flight files.

### Simplification of `download_and_manage_file`

With end-of-invocation wipe, `target_path` is guaranteed not to exist at
the start of a new invocation. The hash-compare branch and the
rename-with-counter branch become unreachable and are removed.

Resulting function (in `analyser/extraction.py`):

```python
def download_and_manage_file(url, file_id, file_type, filename=None,
                              downloads_dir=None):
    """Download a file and return (file_path, needs_reprocess).

    needs_reprocess is always False under the end-of-run cleanup
    contract; the parameter is kept for signature compatibility with
    existing callers and may be removed in a follow-up if no caller
    uses it.
    """
    if downloads_dir is None:
        downloads_dir = ensure_downloads_directory()

    if filename:
        file_ext = os.path.splitext(filename)[1]
    else:
        url_path = urllib.parse.urlparse(url).path
        file_ext = os.path.splitext(url_path)[1] or '.mp3'

    target_filename = f"{file_type}_{file_id}{file_ext}"
    target_path = os.path.join(downloads_dir, target_filename)
    temp_path = os.path.join(downloads_dir, f"{target_filename}.tmp")

    urllib.request.urlretrieve(url, temp_path)
    if not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise RuntimeError(f"Downloaded file is missing or empty: {temp_path}")

    os.rename(temp_path, target_path)
    return target_path, False
```

The `if needs_reprocess: print("File matches existing, reprocessing in
Panako: ...")` branches in `panako_processor.py` are now dead and removed
as part of the same change — they only logged a message, no behavior.

## Failure modes

- **`SIGKILL`, OOM kill, power loss:** `finally` does not fire. Acceptable
  because cleanup is unconditional ("wipe whatever is in the dir") and
  not "wipe files this run created". The next invocation's `finally`
  reclaims any orphaned files.
- **Cleanup partial failure** (permission error, file in use): logged at
  WARN, does not propagate. The next invocation tries again.
- **Concurrent invocations of the same script:** the tmux loop in
  `analyse_all.sh` runs `panako_processor.py` one invocation at a time,
  and `run_fingerprint_and_report.py` is a one-shot ad-hoc tool. If an
  operator runs both at once, the late arriver's cleanup may delete the
  early arriver's in-flight file. This is documented as "don't do that"
  rather than guarded with a lockfile.

## Testing

- **Unit — `cleanup_downloads`:** create regular files, a subdirectory
  with files inside, and (on POSIX) a write-protected file → verify the
  regular files are removed, the subdirectory and its contents remain
  untouched, no exception escapes the function, and the WARN log
  mentions the unwritable file count.
- **Unit — `cleanup_panako_worker_dirs`:** create
  `panako_db_worker_123/foo.tdb`, `panako_db_worker_456/bar.tdb`, plus
  an unrelated sibling directory (`panako_db/`, `downloads/`) → verify
  both worker dirs are removed and the unrelated siblings remain.
- **Smoke (manual):** before deploying, run
  `du -sh analyser/downloads analyser/panako_db_worker_*` → trigger one
  `panako_processor.py --previews -b 5` invocation → re-run `du -sh`
  and confirm `downloads/` is empty (panako_db_worker_*/ does not exist
  for `panako_processor.py`; that's only `run_fingerprint_and_report.py`).
- **Smoke — eval extractor is unaffected:** run `python -m eval.sweep` (or
  equivalent eval entry point) without a `--cache-dir` arg → confirm it
  still produces results. The eval re-downloads, which is the expected
  behavior under the "best-effort cache" contract.

## Migration / rollout

- Deploy the change. On the first `panako_processor.py` invocation after
  the deploy, `analyser/downloads/` is wiped (the 8.2 GB reclaim).
- On the first `run_fingerprint_and_report.py` invocation, the stale
  `panako_db_worker_*/` directories also disappear.
- No operator action required.
