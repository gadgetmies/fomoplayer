## Why

The preview analyser runs for days in the `analyser` tmux session, often
watched from a phone. The only way to stop it is to kill the window, which
drops in-flight work and needs the launch command to restart. The owner
wants to pause and resume it from the tmux panel; a pause may take a minute
to finish the work in progress, and the server's state must stay valid if
the machine restarts while paused.

## What Changes

- New `analyser/analyser_pause.sh toggle|status <session>`: toggles a pause
  flag file `analyser/.pause-<session>` (git-ignored) and the session option
  `@analyser_paused`; `status` prints the worker's pause state.
- `analyse_previews.py` reads the flag named by `ANALYSER_PAUSE_FILE`:
  while it exists, no queue fetch, download or Panako run starts; running
  embedding, waveform and Panako runs and queued fingerprint uploads finish
  and are reported; it then idles with its models loaded and resumes when
  the flag is removed. It writes `pausing: N running` / `paused` to
  `<flag>.state`.
- `analyse_all.sh`: each window loop exports `ANALYSER_PAUSE_FILE` and does
  not (re)start a worker while the flag exists; the session gets `prefix P`
  and a tappable `⏸ pause` / `▶ resume` label (with the state note) on the
  second progress status line, `status-interval 10`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `analyser-orchestration`: adds pausing and resuming the analyser from its
  tmux session.

## Impact

- `analyser/analyse_previews.py`, `analyser/analyse_all.sh`, new
  `analyser/analyser_pause.sh`, `.gitignore`, `analyser/README.md`.
- No backend change. Builds on `separate-fingerprint-upload` (the worker's
  upload thread), which must merge first.
- Design source: `docs/superpowers/specs/2026-11-23-analyser-pause-design.md`.
