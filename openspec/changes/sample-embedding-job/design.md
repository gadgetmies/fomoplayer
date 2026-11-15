# Design

## Context

See proposal.md for why. Today:

- Admin jobs run inside the Node backend (`packages/back/job-scheduling.js`):
  a `job` row plus an optional cron `job_schedule`, a `job_run` row per run
  holding success and a JSON result, and a guard that skips a start while a
  run is in progress. Jobs are registered by migration
  (see `20261016120000-add-sample-match-notified-at-up.sql`).
- The production backend image is `node:22` with no Python. The embedding
  model (Discogs-EffNet, `discogs_multi_embeddings-effnet-bs64-1`) only runs in
  the Python analyser via Essentia + TensorFlow.
- `main.py --audio-samples` decodes a sample to WAV with `pydub` (which shells
  out to `ffmpeg`), loads it with Essentia `MonoLoader` at 16 kHz
  (`resampleQuality=4`), runs the model with output `PartitionedCall:1`, and
  averages the per-patch rows (`embeddings.T.mean(1)`). Previews go through
  the same steps. Sounds like compares the two, so they must stay identical.
- The backend already holds the storage client for sample files and writes
  sample embeddings through `upsertNotificationAudioSampleEmbedding`.

## Goals / Non-Goals

**Goals:**
- Samples get embeddings automatically, visibly in admin Jobs.
- No long-lived admin API key anywhere outside the backend.
- One code path for the model, shared by previews and samples.
- The analyser runs on Python 3.13 without the `audioop` backport.

**Non-Goals:**
- Moving preview embedding, fingerprinting or waveforms into the job system.
- Changing the model, the embedding type or the Sounds like query.
- Changing `analyse_all.sh` (samples still have no embedding window there).

## Decisions

### The backend job does the work; the Python service only computes vectors

The job queries pending samples, reads each file from the storage bucket with
the backend's own storage client, POSTs the bytes to the service's `/embed`
and upserts the vector. The service is stateless: audio in, vector out.

Alternatives considered:
- *The service polls the admin API itself* (as `main.py` does): it would need
  an admin API key stored in Railway, which is the credential problem this
  change removes, and its runs would not appear in admin Jobs.
- *The job only wakes the service, which then fetches and writes*: still needs
  the key, and the job cannot report what happened per sample.
- *Model in Node (ONNX)* and *Python inside the backend image*: rejected with
  the owner on 2026-11-15; the first risks preprocessing drift from Essentia,
  the second bloats every web deploy and puts model CPU on the web server.

### Service on Railway's private network with a shared token

The service gets no public domain and is reached at its
`*.railway.internal` address. The backend reads `EMBEDDING_SERVICE_URL` and
`EMBEDDING_SERVICE_TOKEN` through `fomoplayer_shared/config`; the service
reads the same token from its environment and compares it in constant time.
The token guards against anything else on the private network, not the
internet. No deployment URL is written in source (configuration policy).

### Minimal HTTP surface, standard library server

`embedding_service.py` uses `http.server.ThreadingHTTPServer` with two routes:
`GET /health` and `POST /embed` (raw audio body, `Content-Type` naming the
format, response `{ "model": ..., "embedding": [...1280 floats] }`). The model
is loaded once at start; inference is serialised with a lock, since the job
sends one sample at a time anyway. A framework would add dependencies for no
gain at this size.

### One shared embedding module

`analyser/embedding.py` owns decode → `MonoLoader` → model → averaging and
returns the vector. `main.py` (previews and samples) and the service both call
it. The parity requirement in the spec is then a property of one function,
checked by a test that runs it against the old inline code on fixture audio.

### Replace `pydub` with a direct `ffmpeg` helper

`pydub` 0.25.1 (2021) imports `audioop`, removed from the standard library in
Python 3.13. It is a thin wrapper here: every call site decodes to a 16-bit
PCM WAV via `ffmpeg`. `analyser/audio_decode.py` exposes
`to_wav(src, dst, max_seconds=None)` running
`ffmpeg -nostdin -y -i src -vn -acodec pcm_s16le [-t N] -f wav dst`, keeping
the source sample rate and channels as `pydub` did, and raising with
ffmpeg's stderr on failure.

Alternatives considered:
- *Keep `pydub` plus `audioop-lts`*: works, but keeps an unmaintained
  dependency alive through a backport.
- *Let Essentia decode MP3 directly*: Essentia bundles its own decoder, which
  can differ slightly from system `ffmpeg`; that would shift sample
  embeddings away from the stored preview embeddings.

### Batch and schedule

Default batch 20 samples per run (config `EMBEDDING_JOB_BATCH_SIZE`),
schedule every 10 minutes, newest first, matching
`queryNotificationAudioSamplesWithoutEmbedding`. The upload route calls
`runJob` without awaiting; the in-progress guard prevents overlap.

## Risks / Trade-offs

- [Decoded audio differs after dropping `pydub`] → before removing it, a test
  decodes fixture files (`.mp3`, `.wav`, Beatport `.LOFI`) both ways and
  requires identical PCM samples; and an embedding of each through the new
  path must have cosine ≥ 0.9999 with the old path.
- [A sample that never decodes is retried every run] → it costs one failed
  request per run and is named in each run result; if such samples pile up,
  add a failure marker (column `user_notification_audio_sample_embedding_failed_at`)
  in a later change.
- [Service down or cold] → the job records the connection error per run and
  retries next run; uploads are unaffected.
- [Image size and memory] → Essentia-TensorFlow makes a large image (~1.5 GB)
  and the model needs a few hundred MB of memory; acceptable for one small
  service, and it can be scaled to zero later if Railway serverless suits it.
- [Railway preview environments clone production services] → a PR environment
  either gets its own service (works) or none (job reports skipped).

## Migration Plan

1. Merge and deploy the analyser changes and the service image; owner creates
   the Railway service in production from `analyser/Dockerfile`, no public
   domain, and sets `EMBEDDING_SERVICE_TOKEN`.
2. Owner sets `EMBEDDING_SERVICE_URL` and `EMBEDDING_SERVICE_TOKEN` on the
   backend. Until then the job runs and reports skipped.
3. The migration registers the job and schedule on deploy; the first run
   embeds any pending samples.

Rollback: disable the job (`job_enabled = false`) or unset the URL; the down
migration removes the job rows. Manual `main.py --audio-samples` keeps working
throughout.
