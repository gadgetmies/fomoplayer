## Why

Bandcamp and Beatport rate-limit preview downloads, so the analyser workers
(waveform, fingerprint, embedding) have to slow down to stay off the stores'
block lists. Each worker downloads the same preview on its own, which triples
the store traffic, and every worker carries its own copy of the throttling and
rate-limit handling. When a worker is paused by a rate limit, its analysis
stops even though there is CPU to spare.

## What Changes

- Add a backend job, `prefetchPreviewAudio`, scheduled every 10 minutes on the
  production backend (Railway). It downloads the audio of Bandcamp and Beatport
  previews that still need an analysis and stores it in the existing storage
  bucket under a random key (`preview-audio/<uuid>.mp3`). Each preview is
  downloaded once for all three analyses.
- The job's store traffic is throttled:
  - Bandcamp stream URLs are signed per track and expire, so they are not
    stored. Every Bandcamp request goes through the backend's Bandcamp client,
    which spaces requests 2 s apart (the analyser's `bandcamp.py` interval) and
    shares its rate-limit pause with playback. This covers release lookups and
    downloads, because the mobile API's stream URLs are
    `bandcamp.com/stream_redirect` links.
  - Bandcamp stream URLs (`bandcamp.com/stream_redirect`, which stay usable
    for days) are stored per preview and used until they are
    `BANDCAMP_STREAM_URL_REFRESH_AGE_DAYS` old (13 by default) or fail. A
    lookup replaces the URLs of every track of the release. Tracks the watch
    job has just added use the URLs the client kept from that fetch.
  - Beatport downloads go one at a time, at least
    `PREVIEW_AUDIO_DOWNLOAD_INTERVAL_MS` apart (default 1000 ms), side by side
    with Bandcamp's.
  - On a 429 or 403 the job stops downloading from that store and pauses it for
    10 min, doubling up to 1 h (the analyser's backoff). A Bandcamp challenge
    page, or a stream refused again after a fresh lookup, pauses all Bandcamp
    requests, as other Bandcamp rate limits do.
  - The number of files stored but not yet analysed is capped
    (`PREVIEW_AUDIO_PREFETCH_MAX_STORED`, default 1000), so the bucket can't
    fill up while the workers are stopped.
- Add a table, `store__track_preview_audio`, that tracks the stored file of a
  preview and its failed fetch attempts. A preview is marked missing after 3
  failed attempts, or at once when the store no longer has it.
- The worker queue endpoints (`GET /api/admin/analyse`, `/admin/preview`,
  `/admin/exact-match/previews/without-fingerprint`) return an `audio_url` for
  each stored preview: `/api/storage/<key>`. With `?audio=stored`, they serve
  only previews whose audio is stored.
- The analyser workers ask for `audio=stored` by default and download from
  `audio_url`, so they never contact the stores. `--direct-download` restores
  the old behaviour, which runs without the job (local development, or a
  backend that does not have the job deployed yet).
- With `--direct-download`, the analyser's `bandcamp.py` keeps the stream URLs
  of every release it looks up in a file shared by the workers and across
  runs, and uses each one until shortly before it expires, so a release page
  is fetched at most about once a day.
- Playback uses the stored Bandcamp stream URL, so pressing play no longer
  looks the release up at Bandcamp. When the player cannot play the URL it
  asks for a fresh one (`?refresh=true`), once per track. A listener's lookup
  skips the Bandcamp request queue but takes its slot; a prefetch of the next
  track (`?prefetch=true`) waits in the queue.
- Once a preview has every analysis (its fingerprint, its embedding for the
  production model and, for Bandcamp, its waveform) or is marked missing, the
  backend deletes its stored file. This runs when a worker posts a result and
  again at the start of every job run.

## Capabilities

### New Capabilities
- `preview-audio-prefetch`: the prefetch job, its throttling, the stored-audio
  queue contract and the release of stored audio after analysis.

### Modified Capabilities
_None._ The queue endpoints only gain an optional field and query parameter.

## Impact

- Code: `packages/back/jobs/prefetch-preview-audio.js` (new),
  `packages/back/routes/admin/preview-audio.js` (new),
  `packages/back/routes/admin/db.js`, `packages/back/routes/admin/api.js`,
  `packages/back/routes/stores/bandcamp/bandcamp-api.js`,
  `packages/back/routes/stores/bandcamp/stream-urls.js` (new),
  `packages/back/routes/stores/bandcamp/logic.js`, `packages/front/src/Preview.js`,
  `packages/back/job-scheduling.js`, `packages/back/migrations/`,
  `analyser/main.py`, `analyser/panako_processor.py`, `analyser/waveform.py`,
  `analyser/analyse_all.sh`, `analyser/README.md`.
- Operations: the job uses the backend's existing `AUDIO_SAMPLE_STORAGE_*`
  bucket, so no new Railway service or variables are needed. The optional
  tuning variables are listed above.
- Storage: Bandcamp files are full tracks (~5 MB each). At the default cap that
  is at most ~5 GB, about $0.08 a month on a Railway bucket. Bucket egress to
  the workers is free.
- Store traffic: the backend's server address now also downloads audio.
  Every Bandcamp request (lookups and downloads) shares the playback client's
  2 s spacing and rate-limit pause, so the job cannot lift the request rate
  above what playback already allows, and it stops whenever Bandcamp pauses the
  backend.
