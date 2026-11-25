## ADDED Requirements

### Requirement: The analyser MUST pause and resume gracefully from its tmux session

`analyse_all.sh` MUST give its session a pause toggle: `prefix P` and a
tappable label on the progress status line. Toggling MUST create or remove
the flag file `analyser/.pause-<session>`. While the flag exists, the
combined preview worker MUST NOT fetch from the queue, start downloads or
start Panako runs; it MUST let running downloads, embeddings, waveforms,
Panako runs and queued fingerprint uploads finish and report their results,
then idle with its models loaded until the flag is removed. The window loop
MUST NOT (re)start a worker while the flag exists.

#### Scenario: Paused before work starts
- **WHEN** the flag exists when the worker starts
- **THEN** no preview is downloaded, and after the flag is removed the queue is processed normally

#### Scenario: Paused mid-run
- **WHEN** the flag is created while previews are being analysed
- **THEN** analyses already running finish and are reported, no new download starts, and the worker's state reads `paused` once nothing is running

#### Scenario: Restart while paused
- **WHEN** the machine restarts while the worker is paused with previews fetched but not finished
- **THEN** the backend still lists those previews as needing analysis, because nothing was reported for them

### Requirement: The pause state MUST be visible in the session

The status bar MUST show `⏸ pause` while running and `▶ resume` while the
flag exists, flipping when toggled, and a note reading `pausing: N running`
while draining and `paused` once idle.

#### Scenario: Toggling from the status bar
- **WHEN** the owner taps the `⏸ pause` label
- **THEN** the label reads `▶ resume` at once and the note moves from `pausing: N running` to `paused`
