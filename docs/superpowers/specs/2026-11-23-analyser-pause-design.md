# Pausing the analyser from its tmux session — design

Date: 2026-11-23. Status: approved by the owner in chat.

## Intent

The owner runs the preview analyser for days in the `analyser` tmux session
(`analyser/analyse_all.sh`), often from a phone. They want to pause it and
resume it from the tmux panel without killing the window. Pausing does not
need to be immediate: work in progress (running embedding and Panako runs)
finishes, nothing new starts. Losing the most recent local work on a
machine restart is fine as long as the server's state stays valid.

## Goals

- Toggle pause/resume from tmux: a key (`prefix` `P`) and a tappable label
  in the status bar (mouse is on; the owner uses a phone).
- Graceful: running embeddings, Panako runs and fingerprint uploads finish
  and are reported; no new queue fetches, downloads or Panako runs start.
- Visible: the label flips at once (`⏸ pause` / `▶ resume`); a note shows
  `pausing: N running`, then `paused`.
- The server's queue stays valid: results are only ever reported for
  complete analyses (already true), so a restart while paused only loses
  unreported local work, which the queue serves again.

## Non-goals / anti-goals

- Not an immediate freeze (SIGSTOP): uploads and downloads would time out.
- No pause inside the separate workers (`main.py`, `panako_processor.py`,
  `waveform.py`): they pause between runs via the window loop.
- Pausing must not change results or drop reported work.

## Approaches

1. **Pause flag file checked by the worker (chosen).** The toggle creates
   or removes a file; the worker and the window loop read it. Works with
   any worker, survives worker restarts, readable by the status bar.
2. Signals to the worker: state lives in the process, lost on restart and
   invisible to the status bar without extra plumbing.
3. Freezing processes (SIGSTOP/SIGCONT): rejected by the owner's answer;
   network work times out on resume.

## Design

- **Flag:** `analyser/.pause-<session>` (git-ignored). `analyse_all.sh`
  exports its path as `ANALYSER_PAUSE_FILE` in each window's loop.
- **Worker state:** `analyse_previews.py` writes `<flag>.state` with
  `pausing: N running` while draining and `paused` when idle; removes it on
  resume.
- **Toggle script:** `analyser/analyser_pause.sh toggle|status <session>`
  — creates/removes the flag and sets the session option
  `@analyser_paused` so the label flips immediately; `status` prints the
  note from the state file.
- **Worker:** checks the flag every 2 s (wait timeout capped at 2 s).
  Paused: skip fetch, downloads and Panako dispatch; finish running
  futures (embedding, waveform, Panako, uploads) and report. When nothing
  is running: flush reports, write `paused`, poll the flag. Downloaded
  WAVs waiting for Panako stay on disk until resume.
- **Window loop:** before (re)starting a worker, wait while the flag
  exists.
- **tmux:** `analyse_all.sh` sets `@analyser_dir`, binds `prefix P` and
  `MouseDown1Status` on the `pause` status range (other clicks keep the
  default window switching; both bindings act only in sessions with
  `@analyser_dir`), adds the label and note to the right of the second
  progress line, and sets `status-interval 10`.

## Left to the builder

Exact label wording within the above; log lines; tests: an end-to-end
worker test with the stub backend (paused from start, paused mid-run) and
a check of the toggle script.

## Dependency

Built on branch `separate-fingerprint-upload` (same worker file); merge
that first.
