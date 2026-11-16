## ADDED Requirements

### Requirement: The backend MUST serve a combined queue of stored previews with the analyses each still needs

`GET /admin/preview-analysis?limit=N&model=M` MUST return at most `N`
previews whose audio is stored and that are not missing and need at least
one analysis, newest preview first. Each entry MUST carry `preview_id`,
`track_id`, `store_name`, `preview_start_ms`, `preview_end_ms`, `audio_url`,
and booleans `needs_fingerprint` (no fingerprint meta row),
`needs_embedding` (no embedding of type `M`, default the production type)
and `needs_waveform` (a Bandcamp preview without a waveform; always false
for other stores).

#### Scenario: Flags follow the stored analyses
- **WHEN** a stored Bandcamp preview has a fingerprint but no embedding and no waveform
- **THEN** it is served with `needs_fingerprint` false and `needs_embedding` and `needs_waveform` true

#### Scenario: Analysed and unstored previews are not served
- **WHEN** a preview is fully analysed, or missing, or has no stored audio
- **THEN** it is not served

### Requirement: The combined preview worker MUST decode each preview once and run its analyses concurrently

`analyser/analyse_previews.py` MUST download and decode each served preview
once, run every analysis the preview still needs on that one WAV, with the
embedding, waveform and fingerprint stages running concurrently and each
working through previews at its own pace, and delete the WAV once all its
analyses are done. Results MUST equal those of the separate workers. New
downloads MUST wait while the WAVs not yet deleted exceed
`--max-decoded-mb` or `--max-in-flight`. Fingerprinting MUST batch ready
WAVs, up to `--fingerprint-chunk`, into one Panako run per process, and read
at most `PREVIEW_MAX_DURATION_S` of each WAV.

#### Scenario: One download for three analyses
- **WHEN** a stored Bandcamp preview needs a fingerprint, an embedding and a waveform
- **THEN** its audio is downloaded once, all three results are reported, and its WAV is deleted

#### Scenario: Only the missing analyses run
- **WHEN** a preview needs only a waveform
- **THEN** no embedding or fingerprint is computed for it

#### Scenario: Disk stays bounded
- **WHEN** the queue holds more previews than the budget allows
- **THEN** no new download starts until a WAV is deleted

### Requirement: `analyse_all.sh --previews` MUST run the combined worker for stored audio

`analyse_all.sh --previews` MUST spawn one `analyse-previews` window running
`analyse_previews.py --loop` with its `--idle-wait`, instead of the
`fingerprint-previews`, `embedding-previews` and `waveform-previews`
windows. With `--direct-download` or `--separate-workers` it MUST spawn the
three separate windows as before.

#### Scenario: Default previews run
- **WHEN** the operator runs `analyse_all.sh --previews`
- **THEN** one window named `analyse-previews` runs the combined worker

#### Scenario: Separate workers on request
- **WHEN** the operator runs `analyse_all.sh --previews --separate-workers`
- **THEN** the three preview windows run as before
