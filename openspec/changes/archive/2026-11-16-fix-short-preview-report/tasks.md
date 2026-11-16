# Tasks

## 1. Fix the too-short report

- [x] 1.1 Add `wav_duration_seconds(path)` to `analyser/audio_decode.py` with a test in `analyser/test_audio_decode.py` on a generated WAV of known length; verify with `pytest test_audio_decode.py`.
- [x] 1.2 Use it in `main.py`'s too-short branch; verify `pyflakes` reports no undefined name in `main.py`, and that a preview shorter than one model patch is reported missing (run the branch's code on a generated 1-second clip).

## Workflow follow-up

- Archive the change after merge.

## Verification notes

- 1.1: `pytest test_audio_decode.py` 4 passed, 1 skipped (pydub comparison, pydub no longer installed).
- 1.2: `pyflakes main.py` reports no undefined name; a generated 1-second clip gives 0 model patches and the branch prints `Audio too short to embed (1.0 s), reporting preview … missing`.
- Merge boundary: full backend suite (`yarn test`) 667 passed, 0 failed against a local Postgres 16 + pgvector test database.
