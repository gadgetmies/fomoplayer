## ADDED Requirements

### Requirement: The prefetch job MUST store the audio of previews that still need an analysis

A job named `prefetchPreviewAudio` MUST be registered, enabled and scheduled
every 10 minutes. Each run MUST select Bandcamp and Beatport previews that are
not marked missing, have no stored audio, are not analysed (see "Stored audio
MUST be released once every analysis is done") and are not in their retry
wait, newest first. For each one it MUST download the audio and store it in
the configured bucket under `preview-audio/<random uuid>.mp3`, recording the
key, size and time in `store__track_preview_audio`. Beatport previews MUST use
their stored URL. Bandcamp previews MUST use the stream URL the Bandcamp client
kept from an earlier fetch of the release when it is younger than
`BANDCAMP_STREAM_URL_MAX_AGE_MS` (default 7 days), and otherwise look the
release up through the Bandcamp client, once per release.

#### Scenario: A Beatport preview without analyses is stored
- **WHEN** the job runs and a Beatport preview has no fingerprint, embedding or stored audio
- **THEN** its preview URL is downloaded once and stored under a `preview-audio/` key, and a `store__track_preview_audio` row records the key

#### Scenario: Bandcamp previews of one release share one lookup
- **WHEN** two previews of the same Bandcamp release need audio
- **THEN** the release is looked up once and both tracks' streams are stored

#### Scenario: A newly added Bandcamp track needs no lookup
- **WHEN** the watch job fetched a release minutes ago and one of its tracks needs audio
- **THEN** the track is downloaded with the kept stream URL and the release is not looked up again

#### Scenario: A refused kept URL is replaced
- **WHEN** a kept Bandcamp stream URL answers 403 or 410
- **THEN** the release is looked up once and the fresh URL is downloaded

#### Scenario: Without storage configured the run fails and says why
- **WHEN** the bucket client or bucket name is missing
- **THEN** the run returns `success: false` with an error that names the missing storage

### Requirement: The job MUST throttle store traffic and back off on rate limits

Beatport downloads MUST run one at a time, starting at least
`PREVIEW_AUDIO_DOWNLOAD_INTERVAL_MS` (default 1000) apart. Every Bandcamp
request, lookups and stream downloads alike, MUST go through the shared
Bandcamp client (2 s spacing, shared rate-limit pause), and the job MUST skip
Bandcamp while that client is paused. A 429 or 403 from a store MUST stop that
store for the rest of the run and pause it for 10 minutes, doubling up to
1 hour, reset after a successful download. For a Bandcamp stream, a 403 or 410
MUST first trigger one fresh lookup of the release; a second refusal, a 429 or
a challenge page instead of audio MUST pause all Bandcamp requests. A response
that is a page instead of audio MUST NOT be stored. A run MUST stop starting downloads after
`PREVIEW_AUDIO_PREFETCH_MAX_RUN_MS` (default 8 minutes).

#### Scenario: A rate limit pauses the store
- **WHEN** a Beatport download answers 429
- **THEN** no further Beatport download starts in that run or in runs within the next 10 minutes, and the preview is not counted as a failed attempt

#### Scenario: Bandcamp is skipped while the backend is paused
- **WHEN** the Bandcamp client reports that it is rate limited
- **THEN** the run makes no Bandcamp request

### Requirement: The job MUST cap the audio stored but not yet analysed

A run MUST NOT store more audio once `PREVIEW_AUDIO_PREFETCH_MAX_STORED`
(default 1000) files are stored.

#### Scenario: The cap is reached
- **WHEN** as many files are stored as the cap allows
- **THEN** the run stores nothing and reports that the cap was reached

### Requirement: Failing previews MUST NOT block the job

A download that fails without a rate limit MUST increase
`store__track_preview_audio_failed_attempts` and record the error. The preview
MUST NOT be retried within an hour, and it MUST be marked missing on the third
failure. A Beatport 404/410, or a Bandcamp release that does not stream the
track, MUST mark the preview missing at once.

#### Scenario: A gone Beatport preview is marked missing
- **WHEN** a Beatport preview URL answers 404
- **THEN** the preview is marked missing and no audio is stored

#### Scenario: Three failures mark the preview missing
- **WHEN** a preview's download fails with a server error for the third time
- **THEN** the preview is marked missing

### Requirement: Worker queues MUST expose stored audio

`GET /api/admin/analyse`, `GET /api/admin/preview` and
`GET /api/admin/exact-match/previews/without-fingerprint` MUST include
`audio_url` (`/api/storage/<key>`, or `null` when nothing is stored) for each
preview. With the query parameter `audio=stored` they MUST return only
previews whose audio is stored.

#### Scenario: Stored-only fingerprint queue
- **WHEN** a worker requests the fingerprint queue with `audio=stored`
- **THEN** only previews with stored audio are returned, each with its `audio_url`

### Requirement: Stored audio MUST be released once every analysis is done

A preview is analysed when it is marked missing, or when it has a fingerprint
meta row, an embedding of type `discogs_multi_embeddings-effnet-bs64-1` and,
for Bandcamp previews, a waveform. After `POST /api/admin/analyse`,
`POST /api/admin/waveform` and `POST /api/admin/exact-match/previews/fingerprints`,
the backend MUST delete the stored object and the `store__track_preview_audio`
row of each posted preview that is analysed. A failure to release MUST NOT fail
the request. Each job run MUST first release every analysed preview.

#### Scenario: The last analysis releases the audio
- **WHEN** a Beatport preview with stored audio and a fingerprint gets its embedding posted
- **THEN** its object is removed from the bucket and its row is deleted

#### Scenario: A partly analysed preview keeps its audio
- **WHEN** a Bandcamp preview with stored audio gets only its fingerprint posted
- **THEN** its object and row stay

### Requirement: Analyser workers MUST read audio from the bucket

`waveform.py`, `panako_processor.py --previews` and `main.py` MUST request
their queues with `audio=stored` and download from `audio_url` when it is
present, without contacting the store. A `--direct-download` flag MUST restore
the previous behaviour (no `audio=stored`, store downloads). When the backend
returns no `audio_url`, the workers MUST download from the store as before.

#### Scenario: A worker never contacts the store for stored audio
- **WHEN** a queue entry has an `audio_url`
- **THEN** the worker downloads that URL, resolved against `FOMOPLAYER_API_URL`, and makes no Bandcamp lookup
