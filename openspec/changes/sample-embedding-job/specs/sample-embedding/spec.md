# Spec Delta

## Purpose

Makes every uploaded notification audio sample get an audio embedding without
manual work, so its Sounds like list fills in shortly after upload.

## ADDED Requirements

### Requirement: An admin job MUST embed samples that lack an embedding

The job `embedNotificationAudioSamples` SHALL, on each run, take up to a
configured batch of samples that have no embedding of the production
embedding type, newest first, obtain an embedding for each from the embedding
service and store it with that embedding type. It SHALL appear in the admin
job list and run on a schedule.

#### Scenario: Pending sample gets an embedding
- **GIVEN** a sample with no embedding of the production embedding type
- **WHEN** the job runs and the embedding service is reachable
- **THEN** the sample has an embedding of that type
- **AND** its Sounds like request no longer returns `pending: true`

#### Scenario: Already embedded samples are left alone
- **GIVEN** every sample already has an embedding of the production embedding type
- **WHEN** the job runs
- **THEN** the embedding service receives no request and the run succeeds with zero samples processed

### Requirement: The job MUST start after a sample upload

A successful sample upload SHALL start the job without waiting for it; the
upload response MUST NOT depend on the job's outcome. When a run is already
in progress, no second run starts and the new sample is picked up by a later
run.

#### Scenario: Upload starts the job
- **WHEN** a user uploads a sample successfully
- **THEN** the upload response is returned without waiting for embedding
- **AND** a run of the job starts

#### Scenario: Upload while the job runs
- **GIVEN** a run of the job is in progress
- **WHEN** a user uploads a sample
- **THEN** no second run starts and the upload still succeeds

### Requirement: A failing sample MUST NOT stop the rest of the batch

When the audio of one sample cannot be fetched or embedded, the job SHALL
record that sample's error in the run result, leave it without an embedding
so a later run retries it, and continue with the next sample.

#### Scenario: One undecodable sample
- **GIVEN** a batch of three samples where the second cannot be decoded
- **WHEN** the job runs
- **THEN** the first and third get embeddings
- **AND** the run result names the second sample and its error

### Requirement: The job MUST report itself skipped when the embedding service is not configured

When the embedding service address or token is not configured, the job SHALL
end successfully with a result saying it was skipped and why, without
touching any sample.

#### Scenario: Preview environment without the service
- **GIVEN** the embedding service address is not configured
- **WHEN** the job runs
- **THEN** the run succeeds with a skipped result and no sample changes

### Requirement: Sample embeddings MUST match the analyser's preview embeddings

The embedding service SHALL produce, for the same audio, the same vector the
analyser produces for track previews: same model, same decoding to WAV, same
resampling and the same per-patch averaging, so samples and previews are
comparable.

#### Scenario: Same audio, same vector
- **WHEN** one audio file is embedded by the embedding service and by the analyser's preview path
- **THEN** the two vectors have a cosine similarity of at least 0.9999

### Requirement: The embedding service MUST reject requests without the shared token

The embedding service SHALL answer requests that do not carry the configured
shared token with 401 and SHALL NOT run the model for them.

#### Scenario: Missing token
- **WHEN** a request reaches the embedding service without the token
- **THEN** it responds 401 and returns no embedding
