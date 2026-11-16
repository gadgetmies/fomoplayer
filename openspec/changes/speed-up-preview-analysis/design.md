# Design

## Context

See proposal.md. `main.py` parses its arguments and runs at module level; its
preview branch fetches `GET /admin/analyse?batch_size=N`, downloads one preview
per track (trying the track's previews in order until one downloads, resolving
Bandcamp stream URLs when no stored URL is served), then for each track decodes
to WAV with `audio_decode.to_wav`, runs `embedding.compute_temporal_embedding`,
checks the vector with `EmbeddingSanityChecker` and posts it. `waveform.py`
fetches Bandcamp previews without a waveform and, per preview, downloads
(`fetch_preview`, which waits out Bandcamp rate limits through a shared
`Backoff`), decodes, draws with matplotlib and uploads.

## Goals / Non-Goals

**Goals:**
- Load the model once per drain, not once per batch.
- Overlap downloading and decoding with model inference / drawing.
- One report request per embedding batch.
- Keep store traffic exactly as polite as today.

**Non-Goals:**
- Changing embedding, waveform or fingerprint output.
- Parallel model inference (TensorFlow already uses every core).
- The audio-sample branch of `main.py`; `panako_processor.py`.

## Decisions

### `main.py --loop` exits 2 when drained

With `--loop` the preview branch fetches batches until the queue answers empty
and builds the model once, lazily, on the first non-empty batch. On an empty
queue it exits `2` whether or not batches were processed, so the
`analyse_all.sh` window loop sees "empty" (it acts only on `2`). This differs
from `waveform.py --loop`, which exits `0` when drained; `waveform.py` is not
run with `--loop` by `analyse_all.sh`, so its exit code is left alone. Without
`--loop` the behaviour is as today: one batch, exit `0`, or `2` when empty.

`analyse_all.sh --idle-wait` (added on `master` while this change was
proposed) restarts a worker that exited `2` after a wait, because the
backend refills the queue every 10 minutes. Restarting `main.py` would load
the model again after every idle period, so `main.py --loop` takes
`--idle-wait SECONDS` itself: on an empty queue it sleeps and asks again with
the model loaded, and exits `2` only when the wait is `0`. `analyse_all.sh`
passes its own `--idle-wait` value through.

A looping worker would otherwise spin on items that keep failing transiently
(a bucket download error keeps the preview queued): when a batch reports
nothing, the loop waits 60 s before fetching again, as the drain scripts do.
Bandcamp's per-release page cache is cleared between batches, as
`waveform.py` does, because the stream URLs in it expire.

### Ordered, bounded prefetch on two thread pools

`prefetch.ordered(items, prepare, use_store_pool, workers)` yields
`(item, future)` in input order. It keeps at most `workers + 1` items
submitted ahead of the consumer, so at most that many prepared files sit on
disk. Items for which `use_store_pool(item)` is true go to a single-thread
pool, the rest to a `workers`-thread pool. The consumer calls
`future.result()`; an exception raised by `prepare` surfaces there and is
handled per item, as the inline code did.

Threads, not processes: preparing is network I/O plus an `ffmpeg`
subprocess, neither of which holds the GIL, and the model and matplotlib stay
on the main thread (matplotlib's `pyplot` is not thread-safe).

Store traffic stays serial: a `main.py` track goes to the store pool unless
every one of its previews has an `audio_url` (stored in our bucket); a
`waveform.py` preview goes to it unless it has an `audio_url`. The Bandcamp
module's rate limiter and caches, and `waveform.py`'s `Backoff`, are then only
used by that one thread, and the main thread touches them (clearing the
release cache) only between batches, when no task is running.

Preparing decodes to a per-item WAV in the batch's temporary directory and
deletes the downloaded MP3 straight after, so the extra disk use is bounded
by the window plus the item being processed (about 6 × 60 MB for full
Bandcamp tracks with the default 4 workers). Downloads keep `main.py`'s
`download()` with its socket timeout (`ANALYSER_DOWNLOAD_TIMEOUT_S`, from
`master`), so a stalled download cannot pin a pool thread.

### One report request per batch, per-item fallback

The preview branch collects every embedding entry and missing report of a
batch and sends them in one `POST /admin/analyse`. The endpoint processes the
list in one handler and fails it as a whole if one upsert throws, so on a
non-200 answer or a network error the worker resends the entries one by one,
which is what it did before. Before the sanity checker stops the worker
(`sys.exit(1)`), the entries collected so far are sent.

## Risks / Trade-offs

- A whole batch's results are lost if the process dies before the report:
  those previews stay queued and are redone. Batches are small enough
  (default 10) that this costs little.
- A store-pool item at the head of the window holds the bucket items behind
  it; with stored audio (the default) there are no store-pool items.
