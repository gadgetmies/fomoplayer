# Parallel Panako preview fingerprinting

**Date:** 2026-06-01
**Status:** Approved (design)
**Topic slug:** `parallel-panako-preview-fingerprinting`

## Problem

`analyser/panako_processor.py --previews` fingerprints previews **serially** —
the `for preview in previews_to_process` loop downloads, converts, runs Panako,
and uploads one preview at a time (`panako_processor.py:271`). Fingerprinting
the full production catalogue at this rate is slow, and the always-on
`analyse_all.sh` `fingerprint-previews` worker leaves most CPU cores idle.

The obvious lever — running several `panako_processor.py` instances, or adding
parallel tmux workers in `analyse_all.sh` — is unsafe: the work-handout
endpoint (`GET /admin/exact-match/previews/without-fingerprint`,
`queryPreviewsWithoutFingerprint` in `packages/back/routes/admin/db.js:357`) is
a plain `SELECT … ORDER BY id DESC LIMIT N` with **no claiming or locking**.
Concurrent callers receive the **same** top-N rows and would re-fingerprint
identical previews — burning N× the compute for ~1× the throughput.

## Goal

Parallelise the work **inside a single fetched batch**. One worker still fetches
one batch from the queue (so there is no duplicate-work hazard), but the previews
in that batch are fingerprinted concurrently instead of serially, then uploaded
per-preview via the existing API. One implementation, tuned by flags, serving
both one-time bulk backfill and steady-state operation.

### Out of scope

- The **audio-samples** path — it stays serial (small, separate queue) and keeps
  using the existing `extract_panako_fingerprints`.
- The queue/API contract — no backend changes; the handout stays a plain SELECT,
  which is correct because only one worker calls it.
- `run_fingerprint_and_report.py`'s behaviour — only the *location* of two helper
  functions changes (they move to a shared module and it imports them).

## Parallelism model — batched-JVM per sub-batch

- The fetched batch (size = `--batch-size`, the API `limit`) is split into
  **`--workers` sub-batches**.
- Each sub-batch is handled by one process in a `ProcessPoolExecutor`. The process
  runs **one `panako store` + one `panako resolve`** over its files in a single JVM
  invocation each (amortising JVM startup), against an **isolated per-process
  `PANAKO_CACHE_FOLDER`** keyed by PID. It then reads each `{file_id}.tdb` and POSTs
  the fingerprints per preview via the API.
- `files-per-JVM = ceil(batch_size / workers)` — no separate flag.
- `--workers 1` uses the same path (a pool of one) → a single batched JVM call for
  the whole batch.

**Why batched-JVM (not process-pool-per-preview):** it amortises the ~1–2 s JVM
startup over many files, which matters most at the large batch sizes used for
backfill. It also reuses the proven implementation already in
`run_fingerprint_and_report.py`.

### Isolated caches make per-file dedup unnecessary

`extract_panako_fingerprints` currently does `resolve → delete → store → resolve`
to avoid duplicates in the **shared persistent** `analyser/panako_db` cache. With
an **isolated, ephemeral per-process cache** (which the parallel model requires
anyway), each cache starts empty — there is nothing to dedup against — and the
server already does DELETE-then-INSERT on upload (`upsertPreviewFingerprints`,
`packages/back/routes/admin/db.js:376`). So the batched path always stores fresh;
dropping the per-file `resolve → delete` is not a behavioural loss.

## Architecture

### Shared primitives promoted into `extraction.py`

`extraction.py` is the designated side-effect-free shared module (its docstring:
helpers defined here so one-shot consumers can import them "without loading
`panako_processor.py`'s module-level OAuth/IO side effects"). It already houses
`extract_panako_fingerprints`, `read_tdb_file`, `download_and_manage_file`, and the
`PANAKO_*` config.

Move into it:

- `_worker_cache_dir()` — per-PID isolated `PANAKO_CACHE_FOLDER`.
- `_batched_panako_store(audio_paths, cache_dir)` — one `store` + one `resolve` JVM
  call over a batch, returning the parallel list of Panako file IDs.
- `upload_preview_fingerprints(preview_id, fingerprints)` — currently in
  `panako_processor.py`; it is import-safe (only `requests` + lazy `auth`). Moving
  it lets pool workers import **only** `extraction.py` + `auth.py` and never pull in
  `panako_processor.py`'s `load_dotenv()` / `__main__`.

`run_fingerprint_and_report.py` is refactored to import `_worker_cache_dir` and
`_batched_panako_store` instead of defining them locally. `panako_processor.py`
re-exports the moved names for backwards compatibility (it already re-exports
`extraction.py` names).

### New worker function (in `extraction.py`)

`fingerprint_preview_subbatch(jobs)` — a top-level, importable (spawn-safe)
function, mirroring `run_fingerprint_and_report.py`'s `_worker_process_preview_batch`:

- **Phase A** — per-file download + wav-convert; a file that fails is recorded as a
  failed result and does not sink the rest of the sub-batch.
- **Phase B** — `_batched_panako_store` over the prepared files in the isolated cache.
- **Phase C** — per-file `.tdb` read (`read_tdb_file`) + API upload
  (`upload_preview_fingerprints`); per-file try/except so one upload failure is
  isolated.

Returns one result dict per input job: `{id, fp_count, error}`.

### Parent driver (in `panako_processor.py`)

Replaces the serial preview loop:

1. Fetch one batch via `get_next_previews_to_fingerprint(batch_size)` (unchanged).
2. Split into `workers` sub-batches.
3. Submit each to a `ProcessPoolExecutor(max_workers=workers)`; collect results as
   they complete.
4. Drive `--score-after` from the cumulative tally (below).

## Spawn-safety

`ProcessPoolExecutor` uses `spawn` on macOS, which re-imports the worker's module in
each child. The worker function therefore lives in `extraction.py` (no module-level
side effects) and imports only `extraction.py` + `auth.py`. `auth.py` is fully lazy
(no import-time work; `auth_header()` / `get_api_url()` read config on call), so each
worker process acquires auth cleanly on its own.

## `--score-after` under parallelism

`run_server_side_scoring()` is a single **global, idempotent** POST
(`/admin/exact-match/audio-samples/matches`) that re-scores every sample against all
fingerprints server-side; it is not tied to the specific previews just uploaded. So
out-of-order parallel completion does not threaten correctness — only the cumulative
count matters.

The **parent** tallies successfully-uploaded previews as sub-batch results return.
Each time the running total crosses a multiple of `--score-after`, the parent fires
one `run_server_side_scoring()` POST. Pool workers keep fingerprinting during the
POST. The counter remains per-invocation, so (as today) firing within one invocation
still requires `--batch-size ≥ --score-after`.

## CLI surface & defaults

### `panako_processor.py`

- New `--workers N`, **default 4**. Recommended ceiling `cores − 1` to `cores − 2`;
  documented in `--help`. Parallelism is therefore **on by default**.
- `--batch-size` (existing, default 10) is now the per-invocation work unit split
  across workers. For backfill, raise it (e.g. `--batch-size 200 --workers 8`).
- `--score-after`, `--previews`, `--audio-samples` unchanged.

### `analyse_all.sh`

- New `--fingerprint-workers N` that appends `--workers N` to the
  `fingerprint-previews` worker command only (`analyse_all.sh:209`). Other workers
  untouched.
- When unset, the flag is not passed, so `panako_processor.py`'s default (4) applies.

**Steady-state implication:** with the default of 4, the always-on `analyse_all.sh`
`fingerprint-previews` worker now runs 4-way parallel by default. This is intended;
operators on small hosts can set `--fingerprint-workers 1` (or pass `--workers 1`).

## Error isolation & resources

- A per-file failure is isolated to its result entry; a crashed sub-batch is logged
  and skipped without sinking the run (mirrors the existing
  `_worker_process_preview_batch` structure).
- Resource ceiling ≈ `workers` concurrent JVMs + ffmpeg conversions; the operator
  sizes `--workers` to available cores/RAM.
- Uploads are HTTP, so this path has no DB-connection-pool concern (unlike the
  direct-DB `run_fingerprint_and_report.py`).

## Testing

- **Unit:** `_batched_panako_store` and `fingerprint_preview_subbatch` against the
  `analyser/data` fixtures with a temp cache dir; assert per-file isolation (one bad
  file does not drop the others) and that each sub-batch uses a distinct cache dir.
- **Unit:** parent driver with a stubbed pool + stubbed upload/scoring, asserting the
  cumulative `--score-after` fires at the correct counts and that out-of-order results
  are tallied correctly.
- **Manual:** `--workers 4 --batch-size 40` against a dev queue; confirm distinct
  per-process caches and throughput scaling via the existing per-batch logging.

## Files touched

- `analyser/extraction.py` — add `_worker_cache_dir`, `_batched_panako_store`,
  `fingerprint_preview_subbatch`; move `upload_preview_fingerprints` here.
- `analyser/panako_processor.py` — `--workers` flag; replace serial preview loop with
  the parent pool driver; parent-driven cumulative `--score-after`; re-export moved
  names.
- `analyser/run_fingerprint_and_report.py` — import the two promoted helpers instead
  of defining them locally.
- `analyser/analyse_all.sh` — `--fingerprint-workers N` pass-through.
- Tests as above.
