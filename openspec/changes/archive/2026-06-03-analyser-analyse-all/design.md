## Context

The analyser hosts three batch processors that pull work from the backend:

- `analyser/main.py` — generates audio embeddings for store track previews (default mode) or user-uploaded audio samples (`-a`). Default model `discogs_multi_embeddings-effnet-bs64-1`. Single batch then exits.
- `analyser/panako_processor.py` — extracts Panako fingerprints for store track previews (`-p`) or user-uploaded audio samples (`-a`). Single batch then exits.
- `analyser/waveform.py` — generates and uploads waveform PNGs for Bandcamp previews. Single batch then exits.

The only long-running driver today is `analyser/analyse.sh`, a one-line `while true` loop around `main.py -p true -m discogs_multi_embeddings-effnet-bs64-1`. Fingerprints and waveforms have no equivalent, so operators run them manually or set up bespoke supervisors.

All three scripts also write fixed intermediate file paths in the analyser directory (`./output.wav`, `./waveform.png`) — running more than one at a time from the same cwd corrupts the in-flight files.

## Goals / Non-Goals

**Goals:**

- One command launches a long-running drain of every analyser action the operator selects.
- Each (action × target) worker runs independently so a slow or failing action doesn't block the others, and the operator can attach to any one of them to watch progress.
- The outer loop stops cleanly per worker when its backend queue is empty — "drain to nothing" semantics, not "loop forever".
- Concurrent execution is safe: no two workers race on the same intermediate file path.
- Existing `analyse.sh` keeps working — the new orchestrator is additive.

**Non-Goals:**

- Replacing or restructuring the three Python entry points beyond the minimum needed for the above (temp paths + a structured empty-queue exit code).
- Centralised log aggregation, metrics emission, or alerting — tmux scrollback per worker is enough for the worker-host use case.
- Inter-worker scheduling (priorities, fair shares, backpressure between actions) — each worker is independent.
- Cross-host coordination — the orchestrator launches local workers only.

## Decisions

### Bash + tmux for the orchestrator, not a Python supervisor

The orchestrator is a shell script that creates a tmux session with one window per worker. Alternatives considered:

- **Python supervisor that imports the three entry points.** Cleaner state tracking and shared auth/config, but each worker would compete for the same Python process — no real parallelism without `multiprocessing`, and the three entry points have heavy module-load side effects (TensorFlow, MinIO client, Spotify client). Wider refactor; postponed unless future needs justify it.
- **`systemd` / `supervisord` unit files.** Production-grade, but adds an external dependency and is overkill for the worker-host use case. Operators who want this can still wrap `analyse_all.sh` in a unit.
- **GNU `parallel` or backgrounded `&`.** No per-worker terminal to attach to; log streams interleave; no easy way to inspect a stalled worker.

tmux gives one window per worker, scrollback for inspection, and `attach`/`detach` workflow operators already know. The orchestrator stays a flat bash script (~80 lines).

### Structured empty-queue signal: `exit(2)`

Today each script exits `0` whether it processed a batch or found nothing to do. "Loop until drained" needs to distinguish the two. Alternatives:

- **Parse stdout for sentinel strings** (`"No previews to process"`). Brittle — silently breaks if any log line changes.
- **Probe the "next batch" endpoint from the orchestrator** before each invocation. Duplicates endpoint URLs and request logic in shell; ties the orchestrator to backend route shape.
- **One-line `exit(2)` swap in each script.** Conventional Unix idiom (rc=0 success, rc=2 nothing-to-do, rc≥1 other for error), no extra round-trips, no log-parsing.

The per-window loop becomes:

```bash
while :; do
  python <script> <flags>; rc=$?
  case $rc in
    0)  ;;                                 # batch processed
    2)  echo "drained"; break ;;           # queue empty
    *)  echo "error rc=$rc"; sleep 5 ;;    # retry transient errors
  esac
done
```

Error retries match `analyse.sh`'s implicit behaviour (where any non-zero just re-enters the loop) but with a 5-second backoff so a tight crash loop doesn't saturate logs.

### Per-run `TemporaryDirectory` for intermediate WAV/PNG paths

`main.py` and `waveform.py` write to fixed `./output.wav` (and `./waveform.png`). Running them concurrently from the same cwd would corrupt files mid-batch. Alternatives:

- **Per-worker cwd + symlink to `models/`** so each window has its own `./output.wav`. Keeps the underlying scripts untouched. Reversible. But uses cwd as a load-bearing side channel, and leaves stale temp files between iterations.
- **`TemporaryDirectory()` paths inside each script.** Files live inside an automatically-cleaned tempdir; no side channels; no stale-file accumulation. `main.py` already opens a `TemporaryDirectory` for downloads — `output.wav` moves into that same dir for free. `waveform.py` adds a new `TemporaryDirectory` wrapping its WAV + PNG.

The temp-dir approach is the chosen path. `panako_processor.py` already writes uniquely-named WAVs into its `downloads_dir` — no change needed.

### One window per (action × target)

The orchestrator spawns windows for the cross-product of enabled actions and targets, minus pairs that don't apply (samples have no embeddings or waveforms by product decision):

| Target            | Windows spawned                                                   |
|-------------------|-------------------------------------------------------------------|
| `--previews`      | `fingerprint-previews`, `embedding-previews`, `waveform-previews` |
| `--audio-samples` | `fingerprint-samples`                                             |
| both              | all four                                                          |
| neither           | error: must pick at least one target                              |

Alternative — one window per action with internal target switching — was rejected because it couples otherwise-independent failure modes (e.g. a Bandcamp outage stalling waveform work would block fingerprinting if they shared a window).

### tmux `remain-on-exit on`

Each window is created with `set-remain-on-exit on` so when its loop exits (drained or fatal error), the pane stays visible with its final output instead of vanishing. Operators can review what happened before closing the session.

### CLI surface

```
analyse_all.sh [--previews] [--audio-samples]
               [--purchased]
               [--batch-size N]
               [--model NAME]
               [--session NAME]      # default: analyser
               [--no-attach]         # don't tmux attach at the end
```

Defaults match analysis defaults today: model `discogs_multi_embeddings-effnet-bs64-1`, batch size from the underlying script's default (10), purchased off. Without `--no-attach`, the orchestrator ends with `tmux attach -t "$SESSION"` so the operator lands in the session.

Preconditions checked at startup with explicit error messages:

- `tmux` on `PATH`
- `analyser/venv/bin/activate` exists
- `$FOMOPLAYER_API_URL` set (the workers need it; failing here saves an opaque crash inside a pane)
- Named session doesn't already exist (operator picks a different `--session` or kills the old one — no silent join)
- At least one target flag is set

### `analyse.sh` left in place

The existing `analyse.sh` keeps working unchanged for backward compatibility. README points at `analyse_all.sh` as the recommended replacement; we can retire `analyse.sh` later if usage moves over.

## Risks / Trade-offs

- **tmux as a hard dependency on the analyser host.** → Precondition check at startup with an actionable install message; doc note in README.
- **`exit(2)` on empty queue is a behaviour change for `main.py`, `panako_processor.py`, `waveform.py` when run standalone.** Any external supervisor that treats non-zero as error will flap-restart on an empty queue. → `analyse.sh` is the only known external supervisor and it ignores exit codes (`while true; do …; done`), so it is unaffected. Document the new convention in README.
- **One tmux session means a host reboot loses all running workers.** → Out of scope. Operators wanting auto-resume wrap `analyse_all.sh` in `systemd`/`launchd`/`tmux-resurrect`.
- **No global "all drained" hook.** Each window drains independently; the operator notices when all panes are stopped. → Acceptable for the worker-host use case; if needed later, an outer `tmux wait-for` loop is a small addition.
- **Concurrent windows share GPU/CPU on a single host.** TensorFlow embedding and Panako fingerprinting on the same machine can contend. → Out of scope for this change; resourcing is a host-sizing problem. Operators can simply not pass conflicting flags.

## Migration Plan

1. Land code change. No DB migrations, no API change.
2. Operators continue using `analyse.sh` until they choose to switch.
3. To switch: `./analyse_all.sh --previews --purchased` (or similar) replaces `./analyse.sh`. Same venv, same env, same API key.
4. Rollback: stop the tmux session (`tmux kill-session -t analyser`) and resume `analyse.sh`. The Python-side exit-code change is forward-only but compatible — `analyse.sh`'s `while true` loop doesn't read exit codes.

## Open Questions

None. All decisions resolved during brainstorming.
