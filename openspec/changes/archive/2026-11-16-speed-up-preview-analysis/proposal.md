# Proposal

## Why

The embedding worker (`analyser/main.py`) and the waveform worker
(`analyser/waveform.py`) do every step one item at a time, so the CPU sits idle
while files download, and the network sits idle while the model runs:

- `analyse_all.sh` starts a new `main.py` for every batch (default 10 tracks),
  and each start imports Essentia and TensorFlow and loads the model graph
  again.
- `main.py` downloads the whole batch one file at a time before the first
  embedding is computed, then decodes, embeds and posts one track at a time.
- `main.py` sends one `POST /admin/analyse` per track, although the endpoint
  takes a list.
- `waveform.py` downloads, decodes, draws and uploads one preview at a time.

Since the backend's `prefetchPreviewAudio` job stores preview audio in our own
bucket, the workers' downloads no longer touch a store and are not
rate-limited, so they can run several at once.

## What Changes

- `main.py --loop` keeps the model loaded and processes batches until the
  queue is empty, then exits `2`; with `--idle-wait` it waits and asks again
  instead, model still loaded. `analyse_all.sh` passes `--loop` and its
  `--idle-wait` to the `embedding-previews` worker.
- New `analyser/prefetch.py`: an ordered, bounded prefetch that prepares
  (downloads and decodes) the next few items on background threads while the
  current one is processed, and hands results back in queue order.
- `main.py` (previews) and `waveform.py` use it: bucket downloads run on
  `--download-workers` threads (default 4); anything that contacts a store
  (Bandcamp stream lookups, `--direct-download`) stays on one thread, one at a
  time, as before.
- `main.py` (previews) sends one `POST /admin/analyse` per batch with every
  embedding and missing report; if that request fails it falls back to one
  request per item, so one bad item cannot drop the others.
- No change to how an embedding, waveform or fingerprint is computed.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `analyser-orchestration`: the embedding window keeps its worker (and model)
  running across batches; the preview workers prefetch in parallel and the
  embedding worker reports per batch.

## Impact

- **Code:** `analyser/main.py` (preview branch), `analyser/waveform.py`,
  `analyser/analyse_all.sh`, new `analyser/prefetch.py`, tests, and
  `analyser/README.md`. No backend, front-end or schema change.
- **Disk:** at most `--download-workers + 1` decoded WAVs per worker wait
  ahead of the one being processed (a full Bandcamp track is about 60 MB as
  WAV, so about 360 MB with the default 4), and each downloaded MP3 is
  deleted as soon as it is decoded.
- **Not in scope:** the audio-sample branch of `main.py` (a small queue),
  fingerprinting (already parallel), sharing one download between the three
  workers.
