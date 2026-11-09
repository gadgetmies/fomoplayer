## Context

The full design rationale lives in the approved brainstorm doc:
`docs/superpowers/specs/2026-06-01-parallel-panako-preview-fingerprinting-design.md`.
This summarises the decisions for implementation.

`analyser/panako_processor.py --previews` fetches a batch from
`GET /admin/exact-match/previews/without-fingerprint?limit=N` and fingerprints each
preview serially. The endpoint (`queryPreviewsWithoutFingerprint`,
`packages/back/routes/admin/db.js:357`) is a plain `SELECT … ORDER BY id DESC LIMIT N`
with no claiming, so it cannot safely hand distinct work to concurrent callers.
`analyser/run_fingerprint_and_report.py` already implements the parallelism we want
(`ProcessPoolExecutor` + per-PID cache via `_worker_cache_dir` + batched JVM via
`_batched_panako_store`) but writes directly to the DB rather than via the API queue.
`analyser/extraction.py` is the designated side-effect-free shared module.

## Goals / Non-Goals

**Goals:**
- Fingerprint the previews in one fetched batch concurrently, serving both bulk
  backfill and steady-state from one flag-tuned implementation.
- Reuse the proven batched-JVM parallelism by promoting its primitives into the
  shared module.
- Keep `--score-after` meaningful and correct under out-of-order completion.

**Non-Goals:**
- No backend/queue API changes (single fetcher means the plain SELECT stays correct).
- No change to the audio-samples path (stays serial).
- No behavioural change to `run_fingerprint_and_report.py` (only helper locations move).
- No change to the fingerprints produced — only the throughput of producing them.

## Decisions

**Batched-JVM per sub-batch (vs. process-pool-per-preview).** Split the fetched batch
into `--workers` sub-batches; each pool process runs one `panako store` + one
`resolve` over its files in an isolated per-PID `PANAKO_CACHE_FOLDER`.
*Why:* amortises the ~1–2 s JVM startup across many files, which dominates at the
large batch sizes used for backfill. *Alternative rejected:* one JVM per preview maps
1:1 onto today's loop but pays full startup per file — weaker throughput.

**Isolated ephemeral caches; drop per-file dedup.** Each process gets a fresh empty
cache, so the existing `resolve → delete → store` (which guards against duplicates in
the *shared persistent* `panako_db`) is unnecessary; the server also DELETE-then-INSERTs
on upload. The batched path always stores fresh. *Why:* simpler, and required anyway to
avoid LMDB write contention across processes.

**Promote primitives into `extraction.py`.** Move `_worker_cache_dir`,
`_batched_panako_store`, and `upload_preview_fingerprints` into `extraction.py`; add a
spawn-safe top-level worker `fingerprint_preview_subbatch`; refactor
`run_fingerprint_and_report.py` to import the promoted helpers; `panako_processor.py`
re-exports for compatibility. *Why:* one tested implementation, and workers import only
side-effect-free modules. *Alternative rejected:* duplicating helpers, or importing
from `run_fingerprint_and_report.py` (heavy module-level side effects).

**Spawn-safety.** `ProcessPoolExecutor` uses `spawn` on macOS, re-importing the worker's
module per child. The worker lives in `extraction.py` and imports only `extraction.py` +
`auth.py`, both side-effect-free (`auth.py` is fully lazy — no import-time work), so each
process acquires auth on its own.

**Parent-driven cumulative `--score-after`.** `run_server_side_scoring` is a single
global, idempotent POST that re-scores every sample against all fingerprints. The parent
tallies successfully-uploaded previews as sub-batch results return and fires one scoring
POST each time the total crosses a multiple of `--score-after`; workers keep running
during the POST. *Why:* order-independent and correct because scoring is global, not
per-preview.

**`--workers` default 4.** Parallelism on by default for both backfill and steady-state.
`analyse_all.sh --fingerprint-workers N` passes through; unset → worker default 4.

## Risks / Trade-offs

- **N concurrent JVMs + ffmpeg exhaust memory/CPU on small hosts** → default 4 is modest;
  operators set `--workers`/`--fingerprint-workers` to `cores − 1..2`, or `1` to restore
  serial behaviour.
- **Steady-state default flips to 4-way parallel** (a behaviour change for existing
  `analyse_all.sh` runs) → documented in `--help` and the proposal; revert per-host with
  `--fingerprint-workers 1`.
- **A sub-batch crash loses its whole sub-batch** → per-file isolation in Phase A/C plus
  per-sub-batch try/except (mirrors `_worker_process_preview_batch`); failures are logged
  with the preview id and the run continues. Unfingerprinted previews simply reappear in
  the next fetch.
- **Refactor touches the working `run_fingerprint_and_report.py`** → change is limited to
  swapping two local defs for imports; covered by its existing/added tests.

## Migration Plan

Pure code change, no data migration. Deploy the updated analyser; existing invocations
keep working (new flag defaults to 4). Rollback = revert the change; the queue/API and DB
schema are untouched, so no state cleanup is needed.

## Open Questions

None — design approved.
