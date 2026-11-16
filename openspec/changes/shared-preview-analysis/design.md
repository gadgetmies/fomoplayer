# Design

## Context

Builds on `speed-up-preview-analysis` (background prefetch, `main.py --loop`).
The three preview workers read three queues:

| Worker | Queue | Unit | Order |
|---|---|---|---|
| fingerprints | `/admin/exact-match/previews/without-fingerprint` | preview | preview id desc |
| embeddings | `/admin/analyse` | track (all its previews without an embedding) | purchased, cart, published |
| waveforms | `/admin/preview?stores=Bandcamp` | Bandcamp preview | published |

`routes/admin/preview-audio.js` already defines when a preview needs no more
analysis (`analysedCondition`): missing, or fingerprinted and embedded with
the production model and, for Bandcamp, with a waveform. The prefetch job
stores audio for previews that are not analysed, newest preview id first,
and the backend deletes a stored file once the preview is analysed.

All three workers decode with `audio_decode.to_wav` (16-bit PCM, source rate
and channels); fingerprints cap the decode at `PREVIEW_MAX_DURATION_S`
(900 s), the others decode the whole file.

Measured per preview (one core of this host, Python 3.13, essentia-tensorflow
2.1b6): decode 0.40 s / 1.21 s, embedding 1.73 s / 4.14 s, waveform
0.13 s / 0.27 s for 2 min / 6 min of audio; WAV 21 MB / 64 MB. Panako could
not be installed here; its time per preview is not measured.

## Goals / Non-Goals

**Goals:**
- One download and one decode per stored preview.
- No slower than three independent workers: total time stays bounded by the
  slowest analysis, not by the sum or the per-preview maximum.
- Disk bounded and small.
- Identical analysis results.

**Non-Goals:**
- Direct store downloads, Bandcamp stream resolution, audio samples.
- Changing what the backend counts as analysed.

## Decisions

### A combined queue in the backend

`GET /admin/preview-analysis?limit=N&model=M` returns previews whose audio is
stored, not missing, and that need at least one of: a fingerprint (no
`store__track_preview_fingerprint_meta` row), an embedding of model `M`
(default the production type), a waveform (Bandcamp only, as the waveform
worker and `analysedCondition` do). Each row carries `preview_id`,
`track_id`, `store_name`, `preview_start_ms`, `preview_end_ms`, `audio_url`
and the three `needs_*` flags. Order is `store__track_preview_id DESC`, the
prefetch job's order, so files are analysed in the order they were stored.

Doing it in the backend rather than merging the three existing queues in
the worker: the existing queues are ordered differently and paged, so a
preview at the head of one may be far down another, and the worker would
fetch and download it again later for the other analyses.

The embedding queue's ordering (purchased and cart tracks first) is not
kept: with stored audio, what is analysed first is already decided by what
the prefetch job stored.

### Stages run concurrently on the shared WAV, not in lockstep

Running the three analyses one after another per preview would cost the sum
of their times; waiting for all three before starting the next preview
(lockstep) costs, per preview, the slowest analysis, while the other stages
idle. Independent workers instead finish in about the slowest stage's total.
To match that, each stage has its own process(es) and input queue and works
through previews at its own pace; the coordinator keeps a window of decoded
previews in flight and deletes each WAV once every stage that needs it is
done. A stage that runs ahead simply waits for new WAVs; the window only
stalls when the slowest stage is a full window behind, which is when it is
the bottleneck anyway.

- **Download + decode:** `--download-workers` threads (default 4) in the
  coordinator; network I/O and an ffmpeg subprocess, no GIL contention. The
  downloaded file is deleted once decoded.
- **Embedding:** one process (`spawn`), model built once in its
  initializer. TensorFlow already spreads one inference over the cores.
- **Waveform:** one process; matplotlib and the bucket client stay there.
- **Fingerprints:** `--fingerprint-workers` processes (default 4, as
  `panako_processor.py`). A free process takes all WAVs ready for
  fingerprinting, up to `--fingerprint-chunk` (default 8), into one
  `panako store` + `resolve`, so the per-JVM start-up is shared. When
  fingerprinting keeps up, chunks are small and latency is low; when it is
  the bottleneck, WAVs pile up and chunks grow to the cap, amortising the
  JVM. Each chunk uses a fresh `panako_db_worker_<pid>` cache folder that is
  removed afterwards, so a long-running worker does not grow it.
- Processes, not threads, for the three analyses: essentia and matplotlib
  run Python-level code that would otherwise share one GIL with the
  coordinator.

### Backpressure by decoded bytes

A new download starts only while the WAVs not yet deleted total less than
`--max-decoded-mb` (default 1024) and fewer than `--max-in-flight` previews
(default 16) are between download and deletion. Two-minute previews (21 MB
of WAV) stop at 16, about 340 MB; six-minute Bandcamp tracks (64 MB) at 16,
about 1 GB; longer tracks hit the byte budget first. The largest file the
prefetch job stores (30 MB of MP3, about 32 minutes, about 340 MB of WAV)
always fits. The budget can be exceeded by at most the downloads already
running. Today's three workers each keep their own copies, so this is no
more disk than before.

### Fingerprint cap without a second decode

Fingerprints must still read at most `PREVIEW_MAX_DURATION_S`. A WAV longer
than that is copied to a truncated WAV (first `cap × rate` frames, through
the `wave` module) inside the chunk's cache folder. `ffmpeg -t` truncates
the output the same way, so the samples equal the capped decode; a test
checks this.

### Reports

- Embeddings and missing previews: collected and sent with
  `analysis_reports.post_with_fallback('/admin/analyse', …)` (one request,
  per-entry resend on failure), the code moved out of `main.py`.
- Waveforms: the same helper on `/admin/waveform`.
- Fingerprints: uploaded per preview by the fingerprint process, as now
  (that upload is serialised across processes by `.upload_lock`).
- Reports are flushed before each queue fetch and at least every 30 s, so
  the queue never serves a preview whose results are only waiting to be
  sent, and stored files are released promptly.

### Failures

- Bucket download failure: transient; the preview is skipped for 10 min
  within this run and stays queued.
- Decode failure: counted per preview; the third marks it missing, as the
  waveform worker and the prefetch job do (an undecodable file is useless to
  every analysis).
- Too short to embed: reported missing, as `main.py` does.
- Waveform failure: counted; the third marks it missing, as `waveform.py`.
- Embedding or fingerprint failure: skipped for 10 min, stays queued.
- The duplicate-embedding sanity check runs in the coordinator on results in
  submission order (one embedding process keeps them in order); a stop
  flushes reports first.
- A crashed stage process (`BrokenProcessPool`) ends the worker non-zero;
  the `analyse_all.sh` window loop restarts it.

### Loop and exit codes

Same as `main.py`: one fetched batch without `--loop`; with `--loop`, keep
going; on an empty queue with nothing in flight, exit `2`, or with
`--idle-wait S` > 0 wait `S` seconds and ask again (models stay loaded).

### Orchestration

`analyse_all.sh --previews` spawns one `analyse-previews` window running
`analyse_previews.py --loop --idle-wait <idle> …` with the batch size, model,
sanity flag, `--fingerprint-workers` and `--no-waveform` passed through.
`--score-after` only applies to `panako_processor.py`; the combined worker
does not run sample scoring (the backend's 3-hourly rescore covers it).
`--direct-download` or the new `--separate-workers` keep the three windows.

## Risks / Trade-offs

- Panako's per-preview time is unmeasured here; if fingerprinting is the
  bottleneck the combined worker is as fast as `panako_processor.py` with
  the same worker count, minus the extra JVM starts when chunks are small
  (they are small only when fingerprinting is not the bottleneck).
- One process per stage means one crash restarts all three analyses; the
  in-flight previews stay queued and are redone.
- The worker needs `WAVEFORM_STORAGE_*` like `waveform.py`, unless
  `--no-waveform`.
