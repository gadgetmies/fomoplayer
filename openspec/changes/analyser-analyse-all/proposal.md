## Why

The analyser currently has three independent batch processors — `main.py` (embeddings), `panako_processor.py` (fingerprints), `waveform.py` (waveforms) — but only `main.py` has a long-running driver (`analyse.sh`). Operators wanting fingerprints and waveforms to run continuously have to launch and supervise each script by hand, and there is no shared way to drain backlogs across all three.

A single orchestrator that launches the right combination of long-running workers — one per (action × target) pair — closes that gap and lets the analyser host process the whole backlog with one command.

## What Changes

- New `analyser/analyse_all.sh` orchestrator that launches a tmux session with one window per enabled (action × target) pair, each running its own drain loop over the existing Python entry points.
- Target flags `--previews` / `--audio-samples` select which workers spawn:
  - `--previews` → `fingerprint-previews`, `embedding-previews`, `waveform-previews`
  - `--audio-samples` → `fingerprint-samples` only (samples don't need embeddings or waveforms)
  - `--purchased`, `--batch-size`, `--model` are passed through to the relevant workers.
- The three Python entry points (`main.py`, `panako_processor.py`, `waveform.py`) gain a structured "empty queue" exit code (`2`) so the per-window shell loop can distinguish "did work" from "drained" and stop the loop cleanly once nothing remains to process. Other non-zero exits still mean error and trigger a short-backoff retry.
- `main.py` and `waveform.py` switch from a fixed `./output.wav` (and `./waveform.png`) to per-run `TemporaryDirectory` paths so the four windows can run concurrently without clobbering each other's intermediate files.
- The existing `analyse.sh` is left untouched for backward compatibility; the new orchestrator is additive.
- README points operators at `analyse_all.sh` as the recommended replacement.

## Capabilities

### New Capabilities
- `analyser-orchestration`: Coordinates the analyser's three batch workers (fingerprinting, embedding generation, waveform generation) across their two targets (store track previews, user-uploaded audio samples) as parallel drain loops under a single launcher.

### Modified Capabilities
<!-- None — the existing analyser scripts have no capability specs to amend. -->

## Impact

- New file: `analyser/analyse_all.sh`.
- Modified files:
  - `analyser/main.py` — temp-dir output paths; empty-batch `exit(2)`.
  - `analyser/panako_processor.py` — empty-batch `sys.exit(2)`.
  - `analyser/waveform.py` — temp-dir output paths; empty-batch `sys.exit(2)`.
  - `analyser/README.md` — short section on the new orchestrator.
- Runtime dependency: `tmux` on the analyser host. Failing this precondition is reported at startup with an actionable message.
- No backend changes, no DB migrations, no API surface changes.
- Operators currently running `analyse.sh` are unaffected; they can switch to `analyse_all.sh` when ready.
