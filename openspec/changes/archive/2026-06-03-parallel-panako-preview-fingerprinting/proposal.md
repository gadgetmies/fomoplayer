## Why

`analyser/panako_processor.py --previews` fingerprints previews one at a time, leaving most CPU cores idle and making a full-catalogue backfill slow. The obvious fix — running multiple workers — is unsafe because the work-handout endpoint is a plain `SELECT … LIMIT N` with no claiming, so concurrent callers receive the same rows and re-fingerprint identical previews. Parallelising *within* a single fetched batch gives the speedup without that duplicate-work hazard.

## What Changes

- The preview path fingerprints the items in one fetched batch **concurrently** via a `ProcessPoolExecutor` of batched-JVM sub-batches, replacing the serial `for preview in previews_to_process` loop. One worker still fetches one batch, so there is no duplicate-work hazard.
- Each pool process uses an **isolated per-process `PANAKO_CACHE_FOLDER`** (keyed by PID) and runs one `panako store` + one `panako resolve` over its sub-batch, then uploads fingerprints per preview via the existing API.
- New `panako_processor.py --workers N` flag, **default 4** — parallelism is on by default.
- New `analyse_all.sh --fingerprint-workers N` pass-through to the `fingerprint-previews` worker; unset → worker default 4, so the steady-state orchestrator runs 4-way parallel by default.
- `--score-after` becomes **parent-driven cumulative**: the parent tallies uploaded previews and fires the global, idempotent `run_server_side_scoring` POST each time the total crosses a multiple of `--score-after`. Out-of-order completion is safe because scoring is a global server sweep.
- The shared parallel primitives (`_worker_cache_dir`, `_batched_panako_store`) and `upload_preview_fingerprints` move into `extraction.py`; `run_fingerprint_and_report.py` imports the promoted helpers instead of defining them; `panako_processor.py` re-exports for compatibility.
- The per-file `resolve → delete → store` dedup is dropped for previews — isolated ephemeral caches start empty and the server already DELETE-then-INSERTs on upload, so the batched path always stores fresh. (Not a behaviour change to produced fingerprints.)

## Capabilities

### New Capabilities
- `preview-fingerprinting`: the analyser preview-fingerprinting worker — how it fetches a batch, fingerprints previews in parallel within that batch using isolated Panako caches, uploads results, and interleaves cumulative server-side scoring; including the `--workers` knob and its default, and per-file/per-sub-batch error isolation.

### Modified Capabilities
<!-- None. The fingerprints produced are byte-identical to the serial path, so the
     sample-matching capability's requirements and outputs are unchanged — only the
     throughput of producing them changes. -->

## Impact

- **Code:**
  - `analyser/extraction.py` — gains `_worker_cache_dir`, `_batched_panako_store`, the spawn-safe worker `fingerprint_preview_subbatch`, and `upload_preview_fingerprints` (moved here).
  - `analyser/panako_processor.py` — new `--workers` flag; parent pool driver replaces the serial preview loop; parent-driven cumulative `--score-after`; re-exports moved names.
  - `analyser/run_fingerprint_and_report.py` — imports the two promoted helpers instead of defining them locally (behaviour unchanged).
  - `analyser/analyse_all.sh` — new `--fingerprint-workers N` pass-through.
- **Operational:** steady-state `analyse_all.sh` preview fingerprinting now runs 4-way parallel by default; resource use ≈ `workers` concurrent JVMs + ffmpeg conversions. Operators on small hosts set `--fingerprint-workers 1`.
- **No changes to:** the backend/queue API contract, the audio-samples fingerprinting path (stays serial), and `run_fingerprint_and_report.py`'s behaviour.
- **Dependencies:** none added (uses stdlib `concurrent.futures`).
