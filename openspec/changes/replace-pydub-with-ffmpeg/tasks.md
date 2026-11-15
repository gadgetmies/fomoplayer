# Tasks

## 1. Helper and equality proof

- [x] 1.1 Add `analyser/audio_decode.py` with `to_wav(src, dst, max_seconds=None)` per design.md, and `analyser/test_audio_decode.py` decoding fixture `.mp3`, `.wav` and `.LOFI` files (plus one capped decode) with both `pydub` and the helper and asserting equal sample rate, channels and PCM frames; verify with `python -m unittest test_audio_decode` in a venv that still has `pydub` (Python 3.12, or 3.13 with `audioop-lts` for this run only).

## 2. Switch call sites

- [x] 2.1 Replace the `pydub` conversion in `main.py` (both paths), `panako_processor.py`, `waveform.py`, `extraction.py` (keeping the `PREVIEW_MAX_DURATION_S` cap), `run_fingerprint_and_report.py` and `eval/extraction.py` with the helper; verify `grep -rn pydub analyser --include=*.py --exclude-dir=research` lists only the comparison test, and `test_cleanup`, `test_parallel_preview_fingerprinting` and `test_auth_resolve_url` pass.
- [x] 2.2 Embed one fixture through `main.py`'s conversion before and after the switch and verify cosine similarity ≥ 0.9999 (expected identical).

## 3. Drop the dependency

- [x] 3.1 Remove `pydub` from `analyser/requirements.txt`, make `test_audio_decode`'s comparison skip when `pydub` is not importable (the helper-only checks keep running), and update the two `pydub` mentions in `analyser/README.md`; verify a fresh Python 3.13 venv from `requirements.txt` runs `python main.py --help` and `python -m unittest test_audio_decode` without `audioop-lts`.
- [x] 3.2 Run the analyser unit tests green before the merge (no backend code changes, so the backend suite is not affected).

## Workflow follow-up

- Archive the change after merge.

## Verification notes

- 1.1: `pytest test_audio_decode.py` with pydub 0.25.1 + `audioop-lts` on Python 3.13: identical sample width, rate, channels and PCM frames for `from_mp3`/`from_file` on stereo MP3, mono `.LOFI`, and a 2-second capped decode.
- 2.2: a 12-second stereo MP3 embedded with Discogs-EffNet through the pydub WAV and the helper WAV gave bit-identical vectors.
- 3.1/3.2: fresh Python 3.13 venv from `requirements.txt` (no `pydub`, no `audioop`): `main.py --help` runs; analyser tests 24 passed, 3 skipped (the pydub comparison, and two Panako integration tests that need `panako` on PATH, not installed here).
- Found, not changed here: `run_fingerprint_and_report.py` imports `psycopg2`, which `requirements.txt` has never listed; its test needs `psycopg2-binary` installed separately.
