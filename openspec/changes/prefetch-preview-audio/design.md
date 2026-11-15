## Context

Three analyser workers (`waveform.py`, `panako_processor.py`, `main.py`) each
download a preview's audio from the store before analysing it. Bandcamp's
stream URLs expire, so a worker first looks up the track's release (2 s apart,
`analyser/bandcamp.py`) and then downloads a full track. Rate limits on either
request pause the worker for 10 min, doubling up to an hour. Beatport preview
URLs are stored static CDN URLs that need no token.

The backend already has an S3-compatible bucket (`routes/shared/minio.js`), an
unauthenticated `/api/storage/*` route that redirects to a presigned URL, a job
scheduler (`job-scheduling.js`, with `job` and `job_schedule` rows) and a
Bandcamp client that spaces requests 2 s apart and pauses all Bandcamp requests
after a rate limit (`routes/stores/bandcamp/bandcamp-api.js`).

## Goals / Non-Goals

**Goals:** download each preview once, throttled, from one place that runs on
Railway, and let the workers analyse at full speed from the bucket. Keep the
bucket small by deleting audio once every analysis is done.

**Non-Goals:** audio samples uploaded by users (already in the bucket); other
stores (Spotify has no downloadable previews); changing how the workers analyse.

## Decisions

### Run the job in the backend, not as a separate service
The owner chose this. It reuses the bucket client, the database access, the
scheduler and the Bandcamp client's limiter. No new Railway service, image or
variables are needed, and the always-on backend runs an I/O-bound job at almost
no extra cost.
*Trade-off:* downloads now come from the production server's address, the same
one playback uses for Bandcamp lookups. Mitigation: the job's lookups go
through the same client, so they share the 2 s spacing and the rate-limit
pause. The job also checks `isRateLimited()` before it starts on Bandcamp, so
it never adds traffic while playback is paused. Only one job lookup is queued
at a time, so it delays a user's lookup by at most one slot (2 s).

### Bandcamp stream URLs are signed per track
The old page URLs (`t4.bcbits.com/stream/<file hash>/mp3-128/<track id>?ts=…&t=…&token=…`)
and the mobile API's (`bandcamp.com/stream_redirect?track_id=<id>&ts=…&t=…`)
both carry a signature that differs between tracks issued at the same `ts`, so
it covers the track. No site-wide token can be fetched once and reused across
tracks or pages. `ts` is the time the URL was issued. How long a URL stays
valid has not been measured (this environment cannot reach Bandcamp).

### Reuse the stream URLs the watch job already fetched
`tralbum_details` returns the signed URL of every track on a release, and the
watch job calls it for every new release. The Bandcamp client keeps those URLs
in process, keyed by track id, for `BANDCAMP_STREAM_URL_MAX_AGE_MS` (default
1 h, at most 50 000 entries). The prefetch job runs in the same process, so a
newly added track costs no lookup. A release is looked up only when one of its
tracks has no kept URL. A kept URL that is refused (403/410) is replaced by
one fresh lookup. A URL refused again after a fresh lookup is treated as a rate
limit. The cache is lost on a restart; the job then falls back to lookups.

### Throttling
- Every Bandcamp request goes through the shared Bandcamp client: release
  lookups, and downloads through its `fetchStream`, which waits for the same
  2 s request slot and honours the shared pause. The mobile API's stream URLs
  are `bandcamp.com/stream_redirect` links, so a download is a request to the
  edge that rate-limits the pages. `fetch` follows the redirect to the CDN. A
  429 or a challenge page (an HTML 200 instead of audio) pauses all Bandcamp
  requests.
- Beatport downloads go one at a time, starts at least
  `PREVIEW_AUDIO_DOWNLOAD_INTERVAL_MS` (default 1000 ms) apart, in parallel
  with Bandcamp's. A page instead of audio is a failed download.
- On a 429 or 403 the store is paused for 10 min, doubling up to 1 h, and
  reset after a successful download (the waveform worker's `Backoff`).
- One run lasts at most `PREVIEW_AUDIO_PREFETCH_MAX_RUN_MS` (default 8 min).
  The scheduler skips a tick while a run is still going, so runs never overlap.

### Stream downloads straight into the bucket
The response body is passed to `putObject` with its `Content-Length`, so
nothing touches the disk and memory holds only a chunk at a time.

### Random object keys
`/api/storage/*` is unauthenticated. Keys named by preview id would make every
stored full Bandcamp track downloadable by guessing ids. A random UUID key is
only revealed by the admin queue endpoints.

### Table `store__track_preview_audio`
`store__track_preview_id` (PK, FK to `store__track_preview`, cascade),
`store__track_preview_audio_object_key` (null until stored),
`store__track_preview_audio_file_size`, `store__track_preview_audio_stored_at`,
`store__track_preview_audio_failed_attempts`,
`store__track_preview_audio_last_error`,
`store__track_preview_audio_last_attempt_at`. The names follow the schema's
prefix and FK rules, so `store__track_preview NATURAL JOIN
store__track_preview_audio` works. A failed fetch is retried after an hour,
and the preview is marked missing after 3 failures (as in `waveform.py`'s
`MAX_ATTEMPTS`). A store answer of "gone" (404/410 for Beatport, no stream on
the release for Bandcamp) marks it missing at once, as the workers do.

### When audio is released
A preview is *analysed* when it is missing, or when it has a fingerprint meta
row, an embedding of the production model
(`discogs_multi_embeddings-effnet-bs64-1`, the model the search and
cart-similarity queries read) and, for Bandcamp only, a waveform. The waveform
worker only asks for Bandcamp previews (`waveform.py` sends
`stores=Bandcamp`). Release runs best-effort after each `POST /admin/analyse`,
`POST /admin/waveform` and `POST /admin/exact-match/previews/fingerprints` for
the posted previews, and as a full sweep at the start of each job run. A
failure to release never fails the worker's request.

The job only prefetches previews that are *not analysed*, so it never fetches
a preview it would release at once.

### Stored-only queues
The workers send `audio=stored`, so they only get previews whose audio is in
the bucket and never fall back to the stores. An older backend ignores the
parameter and returns no `audio_url`; the workers then download as before, so
the analyser and backend can be deployed in either order.

## Risks / Trade-offs

- [The job and playback share Bandcamp's limit on the server address] → one
  shared limiter and pause for lookups and downloads, one queued job request
  at a time, and the job skips Bandcamp while paused. At most one Bandcamp
  request every 2 s in total, so a full track every ~2 s plus lookups for
  older releases.
- [The 1 h URL age is a guess] → a refused URL costs one extra lookup; measure
  the real validity once Bandcamp is reachable and tune
  `BANDCAMP_STREAM_URL_MAX_AGE_MS`.
- [Workers stopped for days] → the storage cap stops the job; nothing is lost,
  it resumes once files are released.
- [A worker crashes after the job stored a file] → the file stays until the
  analysis is posted, counts toward the cap and is released by the next sweep.
- [The production embedding model changes] → previews without an embedding of
  the new model are prefetched again, which is wanted for re-analysis. The
  model name is a constant shared with the queries that read embeddings.
