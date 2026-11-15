# Proposal

## Why

An uploaded audio sample's "Sounds like" list stays `pending` until the sample
has an embedding, and the only thing that makes one is an operator running
`analyser/main.py --audio-samples` by hand with an admin API key. Nothing runs
it automatically (`analyse_all.sh --audio-samples` only fingerprints), so every
new upload waits until someone remembers. On 2026-11-15 all ten production
samples were still pending and had to be embedded from a temporary key.

The analyser also no longer starts on Python 3.13: its audio conversion goes
through `pydub`, which imports the `audioop` module that Python 3.13 removed.
`pydub` has had no release since 2021, so the gap was patched by hand with the
`audioop-lts` backport for that run.

## What Changes

- New backend admin job, `embedNotificationAudioSamples`, in the existing job
  system: listed under admin Jobs, run on a schedule, startable by hand, and
  started right after a sample upload. It finds samples without an embedding
  of the production embedding type, sends each one's audio to an embedding
  service and stores the returned vector.
- New embedding service: a small Python HTTP service built from `analyser/`
  that loads the EffNet model once and turns posted audio into the same
  vector `main.py` produces. It runs as its own Railway service on the
  private network, holds no Fomo Player API key and never calls the backend.
- The analyser's embedding code moves into one shared module used by both
  `main.py` and the service, so samples and previews keep being embedded
  identically.
- `pydub` is removed from the analyser. Audio is decoded to WAV by calling
  `ffmpeg` (already required, since `pydub` shelled out to it) through one
  helper, and the decoded audio is checked to be identical to what `pydub`
  produced.
- The service address and its shared token come from configuration. Without
  them the job reports itself skipped, so preview environments and local
  setups without the service keep working.

## Capabilities

### New Capabilities
- `sample-embedding`: generating and storing audio embeddings for uploaded
  notification audio samples automatically, through an admin job and an
  embedding service.

### Modified Capabilities
None. `sample-sounds-like` already returns `pending` until an embedding
exists; this change only makes the embedding appear without manual work.

## Impact

- **Backend** (`packages/back`): new job in `jobs/` and `job-scheduling.js`,
  a migration registering the job and its schedule, a fire-and-forget job
  start in the sample upload route, config for `EMBEDDING_SERVICE_URL` and
  `EMBEDDING_SERVICE_TOKEN`.
- **Analyser** (`analyser/`): new `embedding.py` (shared model code),
  `audio_decode.py` (ffmpeg helper), `embedding_service.py`, a `Dockerfile`
  for the service; every `pydub` call site (`main.py`, `panako_processor.py`,
  `waveform.py`, `extraction.py`, `run_fingerprint_and_report.py`,
  `eval/extraction.py`) switches to the helper; `pydub` leaves
  `requirements.txt`.
- **Infrastructure** (owner actions): a new Railway service in production with
  no public domain, a generated shared token set on it and on the backend,
  and `EMBEDDING_SERVICE_URL` set on the backend.
- **No schema change** to embedding tables; the job writes through the
  existing `upsertNotificationAudioSampleEmbedding`.
