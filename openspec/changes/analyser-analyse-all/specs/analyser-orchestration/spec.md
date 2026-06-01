## ADDED Requirements

### Requirement: Orchestrator launches one drain-loop worker per enabled (action × target) pair

The system SHALL provide an `analyser/analyse_all.sh` orchestrator that launches a tmux session with one window per enabled (action × target) pair. The cross-product is restricted as follows:

- `--previews` enables three windows: `fingerprint-previews`, `embedding-previews`, `waveform-previews`.
- `--audio-samples` enables one window: `fingerprint-samples`.
- Combining `--previews` and `--audio-samples` enables all four windows.
- Audio samples have no embedding or waveform window (by product decision).

Each window runs an inner shell loop that invokes its corresponding Python entry point (`panako_processor.py`, `main.py`, or `waveform.py`) with the appropriate flags, repeatedly, until the worker signals an empty backend queue.

#### Scenario: Previews target spawns three windows

- **WHEN** the operator runs `analyse_all.sh --previews`
- **THEN** the orchestrator creates a tmux session containing exactly three windows named `fingerprint-previews`, `embedding-previews`, `waveform-previews`
- **AND** each window runs a shell loop invoking `panako_processor.py --previews`, `main.py` (preview/embedding mode), and `waveform.py` respectively, until each worker drains.

#### Scenario: Audio-samples target spawns only the fingerprint window

- **WHEN** the operator runs `analyse_all.sh --audio-samples`
- **THEN** the orchestrator creates a tmux session containing exactly one window named `fingerprint-samples`
- **AND** the window runs a shell loop invoking `panako_processor.py --audio-samples` until the worker drains
- **AND** no embedding or waveform window is created for audio samples.

#### Scenario: Both targets spawn four windows

- **WHEN** the operator runs `analyse_all.sh --previews --audio-samples`
- **THEN** the orchestrator creates a tmux session containing four windows: `fingerprint-previews`, `fingerprint-samples`, `embedding-previews`, `waveform-previews`.

#### Scenario: No target flag

- **WHEN** the operator runs `analyse_all.sh` with neither `--previews` nor `--audio-samples`
- **THEN** the orchestrator SHALL print an error explaining that at least one target must be specified
- **AND** SHALL exit with a non-zero status
- **AND** SHALL NOT create a tmux session.

### Requirement: Each worker exits with status 2 when its backend queue is empty

The system SHALL make the three analyser entry points distinguish "did work" from "nothing to do" via exit code:

- Exit `0` after successfully processing a non-empty batch.
- Exit `2` when the "next batch" backend endpoint returns an empty list.
- Exit any other non-zero status for unrecoverable errors.

This applies to `analyser/main.py` (both preview and audio-sample branches), `analyser/panako_processor.py` (both branches), and `analyser/waveform.py`.

#### Scenario: Empty preview queue

- **WHEN** `panako_processor.py --previews` is invoked and the backend returns zero previews to fingerprint
- **THEN** the process SHALL exit with status `2`.

#### Scenario: Empty audio-sample queue (embedding)

- **WHEN** `main.py --audio-samples` is invoked and the backend returns zero audio samples to embed
- **THEN** the process SHALL exit with status `2`.

#### Scenario: Empty waveform queue

- **WHEN** `waveform.py` is invoked and the backend returns zero previews to render
- **THEN** the process SHALL exit with status `2`.

#### Scenario: Non-empty batch

- **WHEN** any of the three entry points processes at least one item in its batch (success or per-item error)
- **THEN** the process SHALL exit with status `0`
- **AND** the per-window loop SHALL invoke it again.

### Requirement: Per-window loop drains, retries on transient error, and stops on drain

The system SHALL run each window's worker in a shell loop that:

- Re-invokes the worker while it exits `0`.
- Breaks the loop when the worker exits `2` (drained), leaving the window pane visible with its final output.
- On any other non-zero exit, waits 5 seconds and re-invokes the worker (transient-error retry).

The loop SHALL NOT swallow `2` as success or treat `0` as a stop condition.

#### Scenario: Drain after processing

- **WHEN** a worker processes one or more non-empty batches and then returns `2` once the queue is empty
- **THEN** the per-window loop SHALL break
- **AND** the tmux window SHALL remain visible (not auto-closed) with its scrollback intact.

#### Scenario: Transient error retry

- **WHEN** a worker exits with status `1` (or any non-zero status other than `2`)
- **THEN** the per-window loop SHALL sleep 5 seconds
- **AND** re-invoke the worker.

### Requirement: Workers write intermediate audio files to per-run temp directories

The system SHALL ensure that `main.py` and `waveform.py` no longer write to fixed paths `./output.wav` or `./waveform.png`. Each invocation SHALL allocate a `tempfile.TemporaryDirectory` (or equivalently auto-cleaned tempdir) and write its intermediate WAV (and `waveform.py`'s PNG) inside that directory.

This SHALL make it safe to run two or more workers concurrently from the same working directory.

#### Scenario: Concurrent main.py and waveform.py

- **WHEN** `main.py` and `waveform.py` run concurrently from the same working directory
- **THEN** each SHALL write its intermediate WAV/PNG into its own temp directory
- **AND** neither SHALL overwrite or read the other's in-flight intermediate files.

#### Scenario: Temp directory is cleaned up

- **WHEN** a worker finishes its batch (success or error)
- **THEN** the temp directory and its contents SHALL be removed.

### Requirement: CLI surface and flag pass-through

The orchestrator SHALL accept the following flags:

- `--previews` — enable preview-target windows.
- `--audio-samples` — enable audio-sample-target windows.
- `--purchased` — passed to `main.py` for `embedding-previews`. Has no effect on other windows.
- `--batch-size N` — passed to every spawned worker via its `-b` / `--batch-size` argument.
- `--model NAME` — passed to `main.py` via `-m`. Default `discogs_multi_embeddings-effnet-bs64-1`. Has no effect on other windows.
- `--session NAME` — tmux session name. Default `analyser`.
- `--no-attach` — skip the final `tmux attach`.

#### Scenario: Default model

- **WHEN** the operator omits `--model`
- **THEN** the `embedding-previews` window SHALL invoke `main.py` with model `discogs_multi_embeddings-effnet-bs64-1`.

#### Scenario: Custom batch size and purchased flag

- **WHEN** the operator runs `analyse_all.sh --previews --purchased --batch-size 20`
- **THEN** the spawned `embedding-previews` window SHALL invoke `main.py -p true -b 20`
- **AND** the spawned `fingerprint-previews` window SHALL invoke `panako_processor.py --previews -b 20`
- **AND** the spawned `waveform-previews` window SHALL invoke `waveform.py` (waveform script does not accept batch size today; pass-through is best-effort).

### Requirement: Startup preconditions are validated before any tmux window is created

The orchestrator SHALL validate the following preconditions at startup and exit non-zero with an actionable message if any fails:

- `tmux` is available on `PATH`.
- `analyser/venv/bin/activate` exists.
- Environment variable `FOMOPLAYER_API_URL` is set.
- A tmux session with the chosen `--session` name does NOT already exist.
- At least one of `--previews` / `--audio-samples` is supplied.

#### Scenario: tmux missing

- **WHEN** the orchestrator is run on a host without tmux on `PATH`
- **THEN** it SHALL print an error naming `tmux` as the missing dependency
- **AND** SHALL exit non-zero before creating any window.

#### Scenario: Existing session collision

- **WHEN** the operator runs the orchestrator and a tmux session with the chosen `--session` name already exists
- **THEN** it SHALL exit non-zero with a message suggesting `--session <other>` or `tmux kill-session -t <name>`
- **AND** SHALL NOT join, modify, or kill the existing session.

#### Scenario: FOMOPLAYER_API_URL unset

- **WHEN** `FOMOPLAYER_API_URL` is unset in the environment
- **THEN** the orchestrator SHALL exit non-zero with a message naming the missing variable
- **AND** SHALL NOT create any tmux window (failing fast instead of crashing inside a pane).

### Requirement: Windows survive worker termination so operators can inspect output

The orchestrator SHALL configure each tmux window with `set-remain-on-exit on` so that when its loop exits — whether due to drain (`2`) or unrecoverable error — the pane stays visible with its final scrollback rather than disappearing.

#### Scenario: Drained window stays visible

- **WHEN** a worker's loop exits because the worker returned `2`
- **THEN** the tmux window SHALL remain in the session
- **AND** the operator SHALL be able to scroll back through the worker's logs until the session is killed.

### Requirement: Default behaviour attaches to the session; `--no-attach` skips that

When the orchestrator finishes launching windows, it SHALL run `tmux attach -t <session>` so the operator lands inside the session. When `--no-attach` is supplied, it SHALL skip the attach step and instead print a message indicating how to attach later.

#### Scenario: Default attach

- **WHEN** the operator runs `analyse_all.sh --previews` (no `--no-attach`)
- **THEN** the orchestrator SHALL execute `tmux attach -t analyser` after creating the windows.

#### Scenario: --no-attach prints how to connect

- **WHEN** the operator runs `analyse_all.sh --previews --no-attach`
- **THEN** the orchestrator SHALL NOT call `tmux attach`
- **AND** SHALL print a message including the command `tmux attach -t analyser`
- **AND** SHALL exit `0`.

### Requirement: `analyse.sh` remains functional for backward compatibility

The existing `analyser/analyse.sh` SHALL be left in place and unchanged. Operators currently using `analyse.sh` SHALL be unaffected by this change and SHALL be able to continue running it as before.

#### Scenario: Legacy driver still works

- **WHEN** an operator runs `analyse.sh` after this change is deployed
- **THEN** it SHALL invoke `python main.py -p true -m discogs_multi_embeddings-effnet-bs64-1` in a loop exactly as before
- **AND** the new `exit(2)` convention SHALL not cause `analyse.sh` to stop (its `while true; do …; done` loop ignores exit codes).
