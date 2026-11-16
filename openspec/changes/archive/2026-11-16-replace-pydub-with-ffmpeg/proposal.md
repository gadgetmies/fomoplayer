# Proposal

## Why

The analyser no longer starts on Python 3.13. Its audio conversion goes
through `pydub`, which imports the `audioop` module that Python 3.13 removed
from the standard library. `pydub` has had no release since 0.25.1 (2021).
On 2026-11-15 a production run of `main.py --audio-samples` needed the
`audioop-lts` backport installed by hand, which keeps an unmaintained
dependency alive rather than fixing it.

In this analyser `pydub` does one thing: it calls `ffmpeg` to turn an audio
file into a 16-bit PCM WAV. Calling `ffmpeg` directly removes the dependency
without changing what any worker produces.

## What Changes

- New `analyser/audio_decode.py` with one helper that decodes any input to a
  16-bit PCM WAV through `ffmpeg`, keeping the source sample rate and
  channels, with an optional length cap.
- Every `pydub` call site switches to the helper: `main.py` (previews and
  audio samples), `panako_processor.py`, `waveform.py`, `extraction.py`
  (keeping its duration cap), `run_fingerprint_and_report.py` and
  `eval/extraction.py`.
- `pydub` leaves `analyser/requirements.txt`; the analyser installs and runs
  on Python 3.13 without `audioop-lts`.
- No change to embeddings, fingerprints or waveforms: a test proves the
  helper's WAV output is sample-identical to `pydub`'s.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. This is a dependency replacement with identical output; the change sets
`skip_specs: true`.

## Impact

- **Code:** the `analyser/` call sites above and the new helper; no backend,
  front-end or schema change.
- **Dependencies:** `pydub` removed; `ffmpeg` stays required (it already was,
  since `pydub` shelled out to it).
- **Docs:** the two `pydub` mentions in `analyser/README.md`.
- **Follow-on:** `sample-embedding-job` builds its Python 3.13 service image
  on this change.
