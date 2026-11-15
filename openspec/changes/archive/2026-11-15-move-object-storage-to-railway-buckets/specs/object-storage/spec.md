## ADDED Requirements

### Requirement: Stored objects MUST be served through a presigned redirect

`GET /api/storage/*key` MUST NOT require authentication. When object storage is
configured, it MUST respond `302` with a `Location` that is a presigned `GET`
URL for `key` in the configured bucket, valid for one hour, and with
`Cache-Control: private, max-age=300`. It MUST respond `404` for an empty key
or a key containing a `..` segment, and `503` when object storage is not
configured.

#### Scenario: Waveform image is requested
- **WHEN** the browser requests `/api/storage/0000c277-ab2c-44ba-ace8-54204c274bbf.png`
- **THEN** the response is `302` to a presigned URL for that key

#### Scenario: Path traversal is rejected
- **WHEN** a client requests `/api/storage/../secret`
- **THEN** the response is `404` and no URL is signed

### Requirement: Object URLs MUST be stored as host-independent API paths

A newly uploaded notification audio sample MUST store
`user_notification_audio_sample_url` as `/api/storage/<objectKey>`, with each
key segment URI-encoded. The analyser MUST report generated waveform URLs as
`/api/storage/<objectKey>`.

#### Scenario: Audio sample upload
- **WHEN** a user uploads `kick.wav`
- **THEN** the stored URL is `/api/storage/notification-samples/<userId>/<uuid>.wav`

### Requirement: Existing storage URLs MUST be migrated to API paths

A migration MUST rewrite
`user_notification_audio_sample_url` values of the form
`http(s)://<host>/<sample bucket>/<object key>` to `/api/storage/<object key>`,
and `store__track_preview_waveform_url` and `store__track_preview_url` values of
the form `http(s)://<host>/fomo-player-waveforms/<key>` to `/api/storage/<key>`.
Any other URL MUST be left unchanged.

#### Scenario: Store waveform is untouched
- **WHEN** the migration runs over a Beatport waveform URL
- **THEN** that row keeps its URL

### Requirement: Storage client MUST support Railway buckets

The storage client MUST accept `AUDIO_SAMPLE_STORAGE_REGION` and
`AUDIO_SAMPLE_STORAGE_URL_STYLE` (`virtual` or `path`, default `path`).
Creating a missing bucket MUST NOT set a public-read bucket policy.
