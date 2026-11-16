## 1. Database

- [x] 1.1 Add the migration creating `store__track_preview_audio` and registering the `prefetchPreviewAudio` job, enabled, scheduled `*/10 * * * *`.

## 2. Backend

- [x] 2.1 Add `routes/admin/preview-audio.js`: queries for previews to prefetch, the stored count, recording stored audio and failures, and `releaseAnalysedPreviewAudio`.
- [x] 2.2 Add `jobs/prefetch-preview-audio.js` with per-store throttling, backoff, the run time limit, the storage cap and Bandcamp lookups through the shared client; register it in `job-scheduling.js`.
- [x] 2.3 Add `audio_url` and the `audio=stored` filter to the three queue queries and routes.
- [x] 2.4 Release audio after the three result-posting routes.

## 3. Backend tests

- [x] 3.1 Job tests with a fake bucket and fake fetch: Beatport store, Bandcamp grouping, gone, failures, rate limit, cap, missing storage, registration.
- [x] 3.2 Queue and release tests: `audio_url`, `audio=stored`, release on the final analysis only.

## 4. Analyser

- [x] 4.1 `waveform.py`, `panako_processor.py`, `main.py`: request `audio=stored`, use `audio_url`, add `--direct-download`.
- [x] 4.2 `analyse_all.sh` passes `--direct-download` through; README documents the job.
- [x] 4.3 Python unit tests for the `audio_url` handling.

## 5. Bandcamp stream URLs

- [x] 5.1 Keep the stream URLs of fetched releases in the Bandcamp client and add a throttled `fetchStream` that shares the client's request slot and pause.
- [x] 5.2 The job downloads Bandcamp audio through `fetchStream`, with stored URLs first, and treats pages instead of audio as failures or challenges.
- [x] 5.3 Tests for the cache, `fetchStream` and the job's use of them.

## 6. Analyser stream URL cache

- [x] 6.1 `bandcamp.py` keeps stream URLs in a shared file until they expire; refused or failed downloads forget them.
- [x] 6.2 Tests for expiry, reuse across runs, forgetting and a broken file.

## 7. Stored stream URLs for playback

- [x] 7.1 Migration adding `store__track_preview_url_ephemeral(_fetched_at)`; `stream-urls.js` stores the URLs of every track of a looked-up release and serves fresh ones.
- [x] 7.2 `BANDCAMP_STREAM_URL_REFRESH_AGE_DAYS` (13); the analyser reads it too.
- [x] 7.3 Priority requests in the Bandcamp client's queue; the player endpoint takes `refresh` and `prefetch`.
- [x] 7.4 The player retries a failed Bandcamp URL once with `refresh=true`; prefetches send `prefetch=true`.
- [x] 7.5 Tests for storage, refresh age, refresh, the player endpoint and the priority queue.

## 8. Store the URL with the track

- [x] 8.1 The Bandcamp transform emits `url_ephemeral` (stream_redirect URLs only); `addStoreTrack` stores it on the URL-less preview.
- [x] 8.2 Drop the backend's in-memory stream URL cache, which only bridged the gap until preview rows existed.
- [x] 8.3 Tests for the watch-style insert, re-insert and the transform.

## 9. Verify

- [x] 9.1 Full backend suite green (`yarn test`), browser tests green (`ci:test:browser`), extension, front-end and analyser unit tests green.
