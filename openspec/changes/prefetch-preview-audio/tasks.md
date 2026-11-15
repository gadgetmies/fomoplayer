## 1. Database

- [ ] 1.1 Add the migration creating `store__track_preview_audio` and registering the `prefetchPreviewAudio` job, enabled, scheduled `*/10 * * * *`.

## 2. Backend

- [ ] 2.1 Add `routes/admin/preview-audio.js`: queries for previews to prefetch, the stored count, recording stored audio and failures, and `releaseAnalysedPreviewAudio`.
- [ ] 2.2 Add `jobs/prefetch-preview-audio.js` with per-store throttling, backoff, the run time limit, the storage cap and Bandcamp lookups through the shared client; register it in `job-scheduling.js`.
- [ ] 2.3 Add `audio_url` and the `audio=stored` filter to the three queue queries and routes.
- [ ] 2.4 Release audio after the three result-posting routes.

## 3. Backend tests

- [ ] 3.1 Job tests with a fake bucket and fake fetch: Beatport store, Bandcamp grouping, gone, failures, rate limit, cap, missing storage, registration.
- [ ] 3.2 Queue and release tests: `audio_url`, `audio=stored`, release on the final analysis only.

## 4. Analyser

- [ ] 4.1 `waveform.py`, `panako_processor.py`, `main.py`: request `audio=stored`, use `audio_url`, add `--direct-download`.
- [ ] 4.2 `analyse_all.sh` passes `--direct-download` through; README documents the job.
- [ ] 4.3 Python unit tests for the `audio_url` handling.

## 5. Verify

- [ ] 5.1 Full backend suite green (`yarn test`); analyser unit tests green.
