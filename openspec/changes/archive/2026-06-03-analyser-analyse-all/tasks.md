## 1. Python entry-point changes

- [x] 1.1 Update `analyser/main.py` so the audio-samples branch's empty-batch path uses `sys.exit(2)` instead of `exit(0)`.
- [x] 1.2 Update `analyser/main.py` so the previews branch's empty-batch path uses `sys.exit(2)` instead of `exit(0)`.
- [x] 1.3 Update `analyser/main.py` so the audio-samples branch writes its converted WAV inside the existing `tempfile.TemporaryDirectory()` (e.g. `os.path.join(temp_dir_name, "output.wav")`) instead of `./output.wav`, and update the subsequent `MonoLoader` / cleanup paths to match.
- [x] 1.4 Update `analyser/main.py` so the previews branch writes its converted WAV inside the existing `tempfile.TemporaryDirectory()` instead of `./output.wav`, and update the subsequent `compute_temporal_embedding` / cleanup paths to match.
- [x] 1.5 Update `analyser/panako_processor.py` so both the audio-samples and previews branches' empty-batch paths use `sys.exit(2)` instead of `sys.exit(0)`.
- [x] 1.6 Update `analyser/waveform.py` to allocate a `tempfile.TemporaryDirectory()` per run and write its intermediate WAV and PNG inside it instead of `./output.wav` and `./waveform.png`.
- [x] 1.7 Add an explicit empty-batch check to `analyser/waveform.py` (after `get_next_waveform_previews()`) that calls `sys.exit(2)` when the batch is empty.

## 2. Orchestrator script

- [x] 2.1 Create `analyser/analyse_all.sh` with a `#!/usr/bin/env bash` shebang and `set -euo pipefail`.
- [x] 2.2 Implement argument parsing for `--previews`, `--audio-samples`, `--purchased`, `--batch-size`, `--model`, `--session`, `--no-attach` with their defaults (`session=analyser`, `model=discogs_multi_embeddings-effnet-bs64-1`).
- [x] 2.3 Implement the precondition checks: `tmux` on `PATH`; `analyser/venv/bin/activate` exists; `FOMOPLAYER_API_URL` set; tmux session name not already in use; at least one target flag supplied. Each failure exits non-zero with a tailored message.
- [x] 2.4 Implement the per-window inner loop as a reusable bash function/string that runs `while :; do ...; case rc in 0) ;; 2) break ;; *) sleep 5 ;; esac; done` and `source venv/bin/activate` first.
- [x] 2.5 Spawn `fingerprint-previews` window (when `--previews`) invoking `python panako_processor.py --previews -b "$BATCH_SIZE"`.
- [x] 2.6 Spawn `embedding-previews` window (when `--previews`) invoking `python main.py -m "$MODEL" -b "$BATCH_SIZE"`, plus `-p true` when `--purchased` is set.
- [x] 2.7 Spawn `waveform-previews` window (when `--previews`) invoking `python waveform.py`.
- [x] 2.8 Spawn `fingerprint-samples` window (when `--audio-samples`) invoking `python panako_processor.py --audio-samples -b "$BATCH_SIZE"`.
- [x] 2.9 Configure each window with `tmux set-option -w -t <session>:<window> remain-on-exit on`.
- [x] 2.10 If `--no-attach` is set, print `Session "<name>" started. Attach with: tmux attach -t <name>` and exit 0; otherwise `exec tmux attach -t "$SESSION"`.
- [x] 2.11 `chmod +x analyser/analyse_all.sh`.

## 3. Documentation

- [x] 3.1 Add a short section to `analyser/README.md` documenting `analyse_all.sh`: usage, flag reference, the four window names, the `exit(2)` convention for empty queues, and the `tmux` precondition. Note that `analyse.sh` is preserved for backward compatibility.

## 4. Manual verification

- [x] 4.1 With `FOMOPLAYER_API_URL` unset, run `./analyse_all.sh --previews`; confirm the orchestrator exits non-zero with a clear message and creates no tmux session.
- [x] 4.2 Without `tmux` on `PATH`, run the orchestrator; confirm it exits non-zero naming the missing dependency.
- [x] 4.3 With `--previews` only, confirm three windows spawn (`fingerprint-previews`, `embedding-previews`, `waveform-previews`) and that the operator is attached to the session by default.
- [x] 4.4 With `--audio-samples` only, confirm exactly one window spawns (`fingerprint-samples`).
- [x] 4.5 With both target flags, confirm four windows spawn.
- [x] 4.6 Force-drain one window (e.g. point at a backend with no work) and confirm the inner loop exits, the window stays visible with `remain-on-exit`, and the rest of the session continues running.
- [x] 4.7 Confirm `./analyse.sh` still runs `main.py` in a loop unchanged after the `exit(2)` convention lands (its `while true` loop ignores exit codes).
- [x] 4.8 Confirm `main.py` and `waveform.py` can run concurrently from `analyser/` without overwriting each other's intermediate files (no `./output.wav` or `./waveform.png` left in the analyser directory after a run).
