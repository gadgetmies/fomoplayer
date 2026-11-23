## 1. Worker

- [x] 1.1 `analyse_previews.py`: read `ANALYSER_PAUSE_FILE` every loop (wait timeout ≤ 2 s); while paused skip fetch, downloads and Panako dispatch, finish running futures and report, write `<flag>.state` (`pausing: N running` / `paused`), remove it on resume.
- [x] 1.2 Tests in `analyser/test_analyse_previews.py`: paused from start (no downloads until resumed), paused mid-run (running work reported, no new downloads, state `paused`).

## 2. tmux

- [x] 2.1 `analyser/analyser_pause.sh toggle|status <session>`; ignore `analyser/.pause-*` in `.gitignore`.
- [x] 2.2 `analyse_all.sh`: export `ANALYSER_PAUSE_FILE` and wait while paused in the window loop; set `@analyser_dir`, bind `prefix P` and the `pause` status range click, add the label and note to the second progress line, `status-interval 10`.
- [x] 2.3 Check the toggle and the bindings on an isolated tmux server; document in `analyser/README.md`.
