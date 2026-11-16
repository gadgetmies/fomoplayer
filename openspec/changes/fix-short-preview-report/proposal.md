# Proposal

## Why

`replace-pydub-with-ffmpeg` (#448) removed the pydub `sound` object from
`analyser/main.py`, but the preview path still prints
`sound.duration_seconds` when a preview is too short to embed. That branch
now raises `NameError`, the surrounding `except` only logs it, and the
preview is never reported missing, so every batch downloads and retries it
again instead of letting it leave the queue.

## What Changes

- New `audio_decode.wav_duration_seconds(path)`, read from the WAV header
  with the standard `wave` module.
- `main.py` uses it in the too-short message, so the preview is reported
  missing again as before #448.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. Restores the behaviour from before #448; the change sets
`skip_specs: true`.

## Impact

- `analyser/audio_decode.py`, `analyser/main.py`, `analyser/test_audio_decode.py`.
