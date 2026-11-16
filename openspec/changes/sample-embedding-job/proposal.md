# Proposal

## Why

An uploaded audio sample's "Sounds like" list stays `pending` until the sample
has an embedding, and the only thing that makes one is an operator running
`analyser/main.py --audio-samples` by hand with an admin API key. Nothing runs
it automatically (`analyse_all.sh --audio-samples` only fingerprints), so every
new upload waits until someone remembers. On 2026-11-15 all ten production
samples were still pending and had to be embedded from a temporary key.

Depends on `replace-pydub-with-ffmpeg`, which makes the analyser run on
Python 3.13 without `pydub`; the service image here builds on it.

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
- **Analyser** (`analyser/`): new `embedding.py` (shared model code, used by
  `main.py` too), `embedding_service.py`, and a `Dockerfile` for the service.
- **Infrastructure** (done by the agent, at the owner's request): a new
  Railway service `embedding` in production with no public domain, a
  generated shared token on it, and the backend's `EMBEDDING_SERVICE_URL` and
  `EMBEDDING_SERVICE_TOKEN` set as Railway references to that service.
- **No schema change** to embedding tables; the job writes through the
  existing `upsertNotificationAudioSampleEmbedding`.
