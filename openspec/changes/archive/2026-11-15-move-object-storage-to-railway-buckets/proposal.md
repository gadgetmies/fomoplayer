## Why

The self-hosted MinIO servers on Railway went offline in late October 2026:
MinIO stopped publishing the `minio/minio` image, so Railway could no longer
pull it and every redeploy failed. Production was restored on a community build
(`pgsty/minio`), but that still keeps an always-on server (memory, CPU, a
volume) in production and in every pull-request preview environment, and it
depends on a fork of an archived project.

Railway Storage Buckets are S3-compatible, cost $0.015 per GB-month with free
bucket egress and no running service. The ~0.75 GB stored today costs about
a cent a month there. They are private only: there are no public buckets, so the
browser cannot keep loading objects straight from the storage host as it does
today.

## What Changes

- Add `GET /api/storage/*key`, an unauthenticated route that answers `302`
  with a presigned `GET` URL for the object (one-hour expiry), so the browser
  fetches the file from the bucket without the service streaming it.
- Store object URLs as the host-independent path `/api/storage/<objectKey>`
  instead of `https://<storage host>/<bucket>/<objectKey>`, for new audio
  sample uploads and for waveforms the analyser generates.
- Add a migration that rewrites the existing absolute MinIO URLs in
  `user_notification_audio_sample_url`, `store__track_preview_waveform_url`
  and `store__track_preview_url` to the new path form. Only URLs that point at
  the stored object's own bucket path are rewritten; store-provided URLs are
  left alone.
- Make the storage client work with Railway buckets: optional
  `AUDIO_SAMPLE_STORAGE_REGION` (`auto` on Railway) and
  `AUDIO_SAMPLE_STORAGE_URL_STYLE` (`virtual` on Railway, `path` default for
  MinIO).
- Stop setting a public-read policy when the bucket is created; reads go
  through presigned URLs everywhere, including a local MinIO.
- Analyser: generated waveforms return the `/api/storage/` path, the storage
  client takes the same region/URL-style settings, and downloads resolve
  `/api/...` paths against `FOMOPLAYER_API_URL`.
- Radiator job: count generated waveforms by the `/api/storage/` prefix instead
  of the old MinIO hostname.

Out of scope: moving pull-request preview environments off their own MinIO.
They keep working with the new code (presigned URLs work against MinIO too).

## Impact

- Code: `packages/back/routes/shared/minio.js`, `packages/back/routes/storage.js`
  (new), `packages/back/index.js`, `packages/back/routes/users/api.js`,
  `packages/back/jobs/radiator/queries/tracks-with-generated-waveforms.sql`,
  `packages/back/migrations/`, `analyser/waveform.py`, `analyser/auth.py`,
  `analyser/extraction.py`, `analyser/main.py`.
- Operations: production `AUDIO_SAMPLE_STORAGE_*` variables point at the
  Railway bucket `storage`; objects were copied from MinIO keeping their keys.
  The analyser's `WAVEFORM_STORAGE_*` settings must name the same bucket.
  Once verified, the MinIO `Bucket` service and its volume can be deleted.
