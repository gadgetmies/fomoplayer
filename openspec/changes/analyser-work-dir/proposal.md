## Why

The combined preview worker decodes previews into a fresh temporary folder
per run (`/private/tmp/analyse_previews_*`) and removes it only on a clean
exit. A worker killed by a window restart or a crash leaves the folder with up
to `--max-decoded-mb` (1 GB) of WAVs behind. On 2026-11-24 six such folders
held ~3 GB on a system disk with 0.7 GB free.

## What Changes

- `analyse_previews.py --work-dir DIR`: at start, delete the leftover files
  the worker itself writes there (`preview_*.mp3`, `preview_*.wav`,
  `waveform_*.png`), nothing else.
- `analyse_all.sh` runs `analyse_previews.py` with `--work-dir
  analyser/work/<session>` (git-ignored), so a killed worker's files are
  removed when the window loop starts the next one.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `analyser-orchestration`: the combined worker cleans its fixed work folder
  on start.

## Impact

- `analyser/analyse_previews.py`, `analyser/analyse_all.sh`, `.gitignore`,
  `analyser/README.md`. Separate workers (`--separate-workers`) are
  unchanged.
