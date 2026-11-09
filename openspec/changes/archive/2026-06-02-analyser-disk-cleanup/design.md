## Context

The analyser ships two scripts that stage audio files on disk and never
remove them:

- `analyser/panako_processor.py` — the production fingerprint worker
  the `analyse_all.sh` tmux orchestrator re-spawns per batch. It calls
  `download_and_manage_file` to fetch the mp3, then converts to wav
  next to it. Both files persist.
- `analyser/run_fingerprint_and_report.py` — the eval-style
  fingerprint+report runner used for ad-hoc evaluation. Same disk
  pattern, plus a `ProcessPoolExecutor` whose workers each
  `os.makedirs` a per-PID `panako_db_worker_<pid>/` LMDB cache that
  also stays behind.

At the time of writing, `analyser/downloads/` holds 8.2 GB across
6,654 mp3 files plus their wav conversions; four stale
`panako_db_worker_*/` directories add another ~130 MB. Production
hosts have been hitting disk pressure.

The shared `analyser/extraction.py` already centralises
`ensure_downloads_directory`, `ensure_panako_db_directory`, and
`download_and_manage_file`, so disk-hygiene helpers belong there
alongside them.

Two analyser scripts — `analyser/main.py` (embeddings) and
`analyser/waveform.py` — already use `tempfile.TemporaryDirectory()`
and clean up correctly. They are the model. The two non-tempdir
scripts simply need analogous end-of-invocation hygiene.

A separate consumer of `analyser/downloads/` is
`analyser/eval/extraction.py`, which uses the same dir as a
content-addressed cache (file name = `sha256(url)`). That cache is
opt-in (callers default to `cache_dir=None`) and the script is not
on the production hot path. Treating its cache as best-effort —
production cleanup may evict, and the next call re-downloads — keeps
the design uniform without breaking eval semantics.

## Goals / Non-Goals

**Goals:**
- Each invocation of `panako_processor.py` and
  `run_fingerprint_and_report.py` leaves `analyser/downloads/` empty
  on exit, regardless of success, exception, or queue-drained
  termination.
- Each invocation of `run_fingerprint_and_report.py` also removes
  every `panako_db_worker_*/` sibling directory before exiting.
- The existing 8.2 GB in `analyser/downloads/` is reclaimed by the
  first post-deploy worker invocation, with no operator action.
- `download_and_manage_file` becomes a single-purpose downloader,
  with the dead caching branches removed.

**Non-Goals:**
- `analyser/panako_db/` (the shared Panako cache used across runs)
  is not touched.
- `analyser/eval/extraction.py` is not modified; its cache becomes
  best-effort and may be re-downloaded after a production wipe.
- `analyser/main.py`, `analyser/waveform.py`, and `analyse_all.sh`
  are not modified. They already behave correctly or are
  orchestration-only.
- No size-bounded LRU, no lockfile-based concurrency guard, no
  one-shot `--purge` subcommand. End-of-invocation wipe alone is
  enough at the present operational scale.

## Decisions

### Decision: Cleanup runs in a `try/.../finally:` at the script entry point, not via `atexit` and not at startup

**Why:** `try/finally` fires on the success path and on uncaught
exceptions alike, is local to the function it guards, and is
visible at the call site. `atexit` handlers don't run on `SIGKILL`
or `os._exit()` and would interact awkwardly with
`ProcessPoolExecutor` workers (each child would inherit the
registration). A startup-time wipe would race destructively if a
second invocation overlapped, and would leave files behind after a
crash until the next start.

**Alternatives considered:**
- `atexit.register` — rejected; not robust under pool semantics.
- Wipe at startup — rejected; destructive race with concurrent
  invocations.
- LRU eviction — rejected; complexity not justified at current
  scale and contests with the parallel worker pool.

### Decision: Cleanup of `panako_db_worker_*/` happens in the orchestrator process, not in `_worker_process_preview_batch`

**Why:** Workers in the pool share the analyser root. If a worker
removed its own dir on exit, the pool's restart-on-task semantics
could remove dirs other workers still depend on. Doing it in the
orchestrator, after `ProcessPoolExecutor.__exit__` has joined all
workers, eliminates that race. As a bonus, the orchestrator can
also reap dirs left over by prior crashed invocations because the
glob is `panako_db_worker_*`, not "my pid only."

### Decision: Helpers never raise; per-entry failures are caught, counted, and printed

**Why:** They run from a `finally:` block. Raising would mask the
original exception (if any) and surface a cleanup failure as the
visible error. Counted error totals keep the operator informed
without crashing the worker loop.

### Decision: `download_and_manage_file` returns just the file path; `needs_reprocess` is removed

**Why:** With end-of-invocation wipe, `target_path` is empty at
start of run, so the hash-compare branch (and the
rename-with-counter branch it guards) is unreachable. The
`needs_reprocess` return value drove only a log line in
`panako_processor.py`. Keeping the dead branches and the dead
return value would force future readers to puzzle out an invariant
that the contract now enforces.

**Alternatives considered:**
- Keep the dead branches with a comment — rejected; comments rot,
  unused code rots faster.
- Keep `needs_reprocess=False` for signature compatibility —
  rejected; both call sites discard it or use it only for the
  dropped log lines, so there is no compatibility to preserve.

### Decision: Logging is via `print()` to stdout, matching the surrounding modules

**Why:** `panako_processor.py`, `run_fingerprint_and_report.py`, and
the rest of `analyser/extraction.py` already use `print()`. The
tmux orchestrator captures stdout in tmux panes/windows; adding a
new logging configuration here would be inconsistent with no
operational benefit.

### Decision: `cleanup_downloads` removes only regular files at the top level; subdirectories are skipped

**Why:** Defensive against future additions to `downloads/` that
might intentionally be subdirectories (e.g. an operator's stash, a
debug bundle). Top-level mp3/wav are the only known disk-bloat
source. If a subdirectory ever becomes a bloat source, the
contract will be revisited explicitly.

## Risks / Trade-offs

- **[Risk] `eval/extraction.py` cache eviction by production cleanup.**
  Eval re-downloads on miss; cache is documented as opt-in and
  best-effort. → Mitigation: documented in the design doc and
  proposal that eval cache survival is not a contract. If the eval
  starts caring about cache stability, follow-up work can give it
  its own subdirectory (`analyser/eval/downloads/`) that production
  cleanup wouldn't touch.

- **[Risk] Two concurrent invocations of cleanup-aware scripts.**
  The `analyse_all.sh` tmux loop runs `panako_processor.py` one
  invocation at a time; `run_fingerprint_and_report.py` is an
  ad-hoc one-shot. Running both at once would let the late
  arriver's cleanup delete the early arriver's in-flight files. →
  Mitigation: documented as "don't do that." Operationally simple
  to avoid since the report runner is interactive. A lockfile
  guard could be added if this becomes a real foot-gun.

- **[Risk] `SIGKILL` / OOM / power loss skips `finally`.**
  Orphaned files stay until the next invocation. → Mitigation:
  cleanup is unconditional ("remove whatever is there"), not
  "remove files I created," so the next invocation reaps them.

- **[Risk] Cleanup-helper partial failure (permission error, file
  in use).** → Mitigation: per-entry try/except + error counter;
  the unremovable file persists but doesn't block the rest of the
  cleanup or crash the worker. The next invocation tries again.

- **[Trade-off] Lost cross-invocation cache of downloaded mp3s.**
  The hash-compare branch in the old `download_and_manage_file`
  had a notional benefit: if the same `(file_type, file_id)` was
  re-queued with identical content, the existing file could be
  re-fingerprinted without re-downloading. In practice the
  production queues are gated on "no fingerprint yet," so a
  fingerprinted file does not come back; the cache benefit is
  hypothetical. Trading it away for predictable disk usage is the
  correct call.

## Migration Plan

1. Land the change. No data migration; no config flips.
2. On the next `panako_processor.py` invocation (the tmux loop
   will trigger one within minutes), `analyser/downloads/` is
   wiped down to empty as part of that invocation's `finally:`.
3. On the next `run_fingerprint_and_report.py` invocation, the
   stale `panako_db_worker_*/` directories are removed.
4. No rollback complexity: reverting the change just stops the
   cleanup; pre-existing data is unaffected.
