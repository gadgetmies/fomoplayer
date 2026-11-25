## Context

`analyse_all.sh` starts the `analyser` tmux session; each window runs a bash
loop that restarts its worker. The combined worker `analyse_previews.py`
keeps up to `--max-in-flight` previews between download and WAV deletion,
runs embeddings and waveforms in one process each, Panako on
`--fingerprint-workers` processes, and uploads fingerprints on one thread.
Results are reported to the backend only when an analysis is complete, so
the backend queue never counts unfinished work as done. The session already
has two progress status lines (`analysis_progress.py`) and mouse support.

## Goals / Non-Goals

**Goals:**
- Pause and resume from tmux by key (`prefix P`) and by tapping a status
  bar label (the owner uses a phone).
- Graceful drain: running work and queued uploads finish and are reported;
  nothing new starts.
- Visible state: the label flips at once; a note shows `pausing: N running`
  then `paused`.

**Non-Goals:**
- An immediate freeze (SIGSTOP) — network work would time out on resume.
- Pausing inside the separate workers mid-run; they pause between runs.

## Decisions

- **A flag file, not signals.** `analyser/.pause-<session>`: the toggle,
  the window loop, the worker and the status bar all read it; it survives
  worker restarts. Signals would keep the state inside one process.
- **Worker poll every 2 s.** The coordinator's wait timeout becomes
  `min(REPORT_INTERVAL_S, 2)`; reading one file per loop is cheap.
- **What "running" means while paused.** Submitted futures (downloads
  already started, embedding/waveform tasks, Panako chunks, uploads) run to
  completion. Pending previews (fetched, not downloaded) and WAVs waiting
  for Panako stay put; they continue on resume. When no future is left the
  worker flushes reports, writes `paused` and polls the flag.
- **State file `<flag>.state`.** Written only when the text changes, removed
  on resume; `analyser_pause.sh status` prints it. The label uses the
  session option `@analyser_paused` (set by the toggle) so it flips without
  waiting for `status-interval`.
- **Bindings guarded by `@analyser_dir`.** tmux key bindings are server
  wide; the `P` binding and the status click act only in sessions where
  `analyse_all.sh` set `@analyser_dir`, and a status click outside the
  `pause` range keeps tmux's default (`switch-client -t =`).

## Risks / Trade-offs

- A paused worker still holds its decoded WAVs (bounded by
  `--max-decoded-mb`) and loaded models: memory is not freed. Acceptable:
  the owner chose a clean pause over freeing resources.
- A machine restart while paused loses fetched-but-unfinished previews;
  the backend serves them again because nothing about them was reported.
- The status note lags by up to `status-interval` (10 s).
