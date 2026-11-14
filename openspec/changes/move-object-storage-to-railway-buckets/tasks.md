## 1. Data copy (operations)

- [x] 1.1 Create the Railway bucket `storage` in production (sjc).
- [x] 1.2 Copy `sample-storage` and `fomo-player-waveforms` from MinIO into the bucket root with a one-off rclone service; verify with `rclone check`.

## 2. Backend

- [x] 2.1 `routes/shared/minio.js`: region and URL-style settings, no public-read policy, `storageObjectPath` and `presignedObjectUrl` helpers.
- [x] 2.2 New `routes/storage.js` redirect route, mounted at `/api/storage` before authentication.
- [x] 2.3 Store `/api/storage/<key>` for new audio sample uploads.
- [x] 2.4 Migration rewriting existing MinIO URLs to API paths.
- [x] 2.5 Radiator query counts generated waveforms by the `/api/storage/` prefix.

## 3. Analyser

- [x] 3.1 `waveform.py`: region/URL-style settings, return the API path.
- [x] 3.2 Resolve `/api/...` URLs against `FOMOPLAYER_API_URL` before downloading.

## 4. Tests

- [x] 4.1 Unit tests for the storage helpers and `ensureBucket`.
- [x] 4.2 API tests for the redirect route (302, traversal 404, unconfigured 503).
- [x] 4.3 Migration test: storage URLs rewritten, store URLs untouched.

## 5. Switch-over (operations)

- [ ] 5.1 Re-run the copy, then point production `AUDIO_SAMPLE_STORAGE_*` at the bucket (`REGION=auto`, `URL_STYLE=virtual`).
- [ ] 5.2 Update the analyser's `WAVEFORM_STORAGE_*` to the same bucket.
- [ ] 5.3 After verification, delete the MinIO `Bucket` service and its volume.
