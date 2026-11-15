# Tasks

## 1. Fix the too-short report

- [ ] 1.1 Add `wav_duration_seconds(path)` to `analyser/audio_decode.py` with a test in `analyser/test_audio_decode.py` on a generated WAV of known length; verify with `pytest test_audio_decode.py`.
- [ ] 1.2 Use it in `main.py`'s too-short branch; verify `pyflakes` reports no undefined name in `main.py`, and that a preview shorter than one model patch is reported missing (run the branch's code on a generated 1-second clip).

## Workflow follow-up

- Archive the change after merge.
