## 1. Helpers in `analyser/extraction.py`

- [x] 1.1 Add `cleanup_downloads(downloads_dir)` that iterates the top
      level of `downloads_dir`, removes only regular files via
      per-entry `try/except`, skips directories and other non-files,
      counts successes and errors, and prints
      `[cleanup] downloads/: removed N files, M errors` before
      returning. Must never raise into the caller.
- [x] 1.2 Add `cleanup_panako_worker_dirs(analyser_root)` that scans
      the top level of `analyser_root`, matches entries whose name
      begins with `panako_db_worker_` AND that are directories,
      removes each via `shutil.rmtree` wrapped in `try/except`, counts
      successes and errors, and prints
      `[cleanup] worker dirs: removed N, M errors`. Must never raise.
- [x] 1.3 Verify by code reading that the matching logic in 1.2 does
      NOT match `panako_db/` (the shared cache) — the underscore
      after `worker` in the prefix is the guard.

## 2. Simplify `download_and_manage_file` in `analyser/extraction.py`

- [x] 2.1 Change the function signature's return annotation/docstring
      to a single `str` (drop the tuple).
- [x] 2.2 Remove the hash-compare branch
      (`if os.path.exists(target_path): ...` block) and its
      compute_file_hash calls.
- [x] 2.3 Remove the rename-with-counter branch
      (`counter = 1; while True: ... new_filename = ...`).
- [x] 2.4 Have the function return `target_path` directly (no
      `needs_reprocess`).
- [x] 2.5 Confirm that `compute_file_hash` is still imported/used
      elsewhere; if it becomes unused inside `extraction.py`, leave
      it exported (it is part of the public surface re-exported by
      `panako_processor.py`).

## 3. Wire cleanup into `analyser/panako_processor.py`

- [x] 3.1 Add `cleanup_downloads` to the existing
      `from extraction import (...)` block.
- [x] 3.2 Wrap the body of `if __name__ == '__main__':` (from the
      `downloads_dir = ensure_downloads_directory()` call through to
      the end of the previews/audio-samples processing) in
      `try: ... finally: cleanup_downloads(downloads_dir)`. The
      `downloads_dir` must be assigned BEFORE the `try:` so the
      `finally:` can reference it.
- [x] 3.3 Update the audio-samples branch to use
      `downloaded_path = download_and_manage_file(...)` (drop the
      tuple unpack and the `needs_reprocess` variable).
- [x] 3.4 Update the previews branch the same way.
- [x] 3.5 Remove both `if needs_reprocess: print("File matches
      existing, reprocessing in Panako: ...")` log lines.
- [x] 3.6 Re-export `cleanup_downloads` (and `cleanup_panako_worker_dirs`
      for symmetry) from `panako_processor.py`'s extraction-helper
      re-export block, matching the existing pattern.

## 4. Wire cleanup into `analyser/run_fingerprint_and_report.py`

- [x] 4.1 Add `cleanup_downloads` and `cleanup_panako_worker_dirs` to
      the existing imports from `extraction`.
- [x] 4.2 In `main()`, before the existing
      `if not args.skip_fingerprint and not args.report_only:`
      block, capture
      `analyser_root = os.path.dirname(os.path.abspath(__file__))`.
      `downloads_dir` is already assigned earlier in `main()`.
- [x] 4.3 Wrap the entire body of `main()` after that point in
      `try: ... finally: cleanup_downloads(downloads_dir);
      cleanup_panako_worker_dirs(analyser_root)`. The `finally:`
      must run after the `ProcessPoolExecutor` in
      `_fingerprint_previews_parallel` has exited (which it does by
      virtue of being a synchronous `with`-statement that returns
      before `main()`'s `finally:` fires).
- [x] 4.4 Update `fingerprint_one` to use
      `downloaded_path = download_and_manage_file(...)`.
- [x] 4.5 Update `_worker_process_preview_batch` to use
      `downloaded_path = download_and_manage_file(...)`.
- [x] 4.6 Confirm by code reading that no cleanup call is added
      inside `_worker_process_preview_batch` or
      `_fingerprint_previews_parallel`.

## 5. Tests

- [x] 5.1 Add a unit test `test_cleanup_downloads_top_level_files`
      that creates regular files plus a populated subdirectory in a
      temp directory, runs `cleanup_downloads`, and asserts that
      only the top-level regular files are gone and the subdirectory
      with its contents survives.
- [x] 5.2 Add a unit test
      `test_cleanup_downloads_tolerates_unwritable_file` that, on
      POSIX, creates files where one is chmod'd to deny removal
      (e.g. chmod 000 on the parent of the file, or use `os.chmod`
      tricks per platform), runs `cleanup_downloads`, and asserts
      the function returns without raising and reports the error
      count in its summary line (capture via `capsys`).
- [x] 5.3 Add a unit test
      `test_cleanup_panako_worker_dirs_removes_only_worker_prefix`
      that creates `panako_db_worker_111/foo.tdb`,
      `panako_db_worker_222/bar.tdb`, `panako_db/keepme.tdb`, and
      `downloads/keepme.txt` under a temp analyser root, runs
      `cleanup_panako_worker_dirs`, and asserts both worker dirs
      are gone while `panako_db/` and `downloads/` survive.
- [x] 5.4 Add a unit test
      `test_cleanup_panako_worker_dirs_skips_non_directories` that
      creates a regular file named `panako_db_worker_oops.txt` at
      the top level, runs the helper, and asserts the file
      survives (helpers only remove directories under the prefix).
- [x] 5.5 Decide whether to add an integration-level test of
      `panako_processor.py`'s `finally:` (probably out of scope
      since the script touches the network and Panako); if not,
      add a brief comment in the PR description pointing at the
      manual smoke test.

## 6. Smoke verification

- [x] 6.1 On a host with the existing 8.2 GB in
      `analyser/downloads/`, run
      `du -sh analyser/downloads analyser/panako_db_worker_*`
      to capture the baseline.
- [ ] 6.2 Run one invocation of
      `python analyser/panako_processor.py --previews -b 5` from
      the analyser virtualenv.
- [ ] 6.3 Re-run `du -sh analyser/downloads` and confirm the
      directory is empty (0 KB or a `du: cannot access ...` if the
      OS lists no entries).
- [ ] 6.4 Run one invocation of
      `python analyser/run_fingerprint_and_report.py --report-only`
      (or the lightest full run available) and confirm that any
      pre-existing `panako_db_worker_*/` directories are gone
      afterwards.
- [ ] 6.5 (Optional) Run `python -m analyser.eval.sweep`-style eval
      entry point without a `--cache-dir` argument and confirm it
      still produces results despite a recent production cleanup.

## 7. PR / commit hygiene

- [ ] 7.1 Stage the change in logical chunks: (a) helpers + tests,
      (b) `download_and_manage_file` simplification, (c) wiring
      into `panako_processor.py`, (d) wiring into
      `run_fingerprint_and_report.py`. Each commit message names
      its piece (e.g.
      `analyser: add cleanup_downloads + cleanup_panako_worker_dirs`).
- [ ] 7.2 Reference the design doc
      `docs/superpowers/specs/2026-06-02-analyser-disk-cleanup-design.md`
      and the OpenSpec change
      `openspec/changes/analyser-disk-cleanup/` in the PR body.
