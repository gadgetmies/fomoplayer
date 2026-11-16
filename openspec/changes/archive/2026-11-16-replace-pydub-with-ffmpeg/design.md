# Design

## Context

See proposal.md for why. Every `pydub` use in `analyser/` is
`AudioSegment.from_mp3(path)` or `AudioSegment.from_file(path[, duration=N])`
followed by `.export(wav_path, format="wav")`. Internally `pydub` runs
`ffmpeg` to decode to 16-bit PCM WAV on stdout, parses it, and writes it back
as a WAV with the same sample rate and channel count. Embeddings (Essentia
`MonoLoader` at 16 kHz), Panako fingerprints and waveforms are all computed
from that WAV, and stored preview results must stay comparable with new ones.

## Goals / Non-Goals

**Goals:**
- No `pydub` and no `audioop` anywhere in the analyser.
- Byte-for-byte the same PCM samples as before at every call site.

**Non-Goals:**
- Changing sample rate, channels, length caps or any downstream processing.
- Touching `analyser/research/`, which has its own environment.

## Decisions

### One helper calling `ffmpeg` directly

`audio_decode.to_wav(src, dst, max_seconds=None)` runs
`ffmpeg -nostdin -hide_banner -loglevel error -y -i src -vn -acodec pcm_s16le [-t N] -f wav dst`
with `subprocess.run(check=True)` and raises an error carrying ffmpeg's stderr
on failure. Leaving out `-ar` and `-ac` keeps the source rate and channels, as
`pydub` did. Call sites keep their existing checks (missing or empty output).

Alternatives considered:
- *Keep `pydub` and add `audioop-lts`*: a backport propping up an unmaintained
  wrapper.
- *Let Essentia decode MP3 directly*: its bundled decoder can differ slightly
  from system `ffmpeg`, moving new embeddings away from stored ones.
- *`soundfile` / `librosa`*: `libsndfile` MP3 support varies by build and the
  Beatport `.LOFI` files need format sniffing that `ffmpeg` already does.

### Prove equality before removing `pydub`

A comparison test decodes fixture `.mp3`, `.wav` and `.LOFI` files with both
`pydub` and the helper and compares sample rate, channel count and raw PCM
frames. It runs while `pydub` is still installed, then skips itself once
`pydub` is gone, so the evidence is in the history without keeping the
dependency.

## Risks / Trade-offs

- [`pydub`'s WAV header differs (e.g. an extra chunk) even when samples match]
  → the test compares frames read with the standard `wave` module, not file
  bytes, since every consumer reads samples.
- [Edge files where `pydub`'s duration cap and `-t` cut at different frames]
  → the comparison test includes a capped decode of a fixture longer than the
  cap.
