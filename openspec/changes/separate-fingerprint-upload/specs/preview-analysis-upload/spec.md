## ADDED Requirements

### Requirement: Fingerprint uploads MUST NOT hold a preview's WAV or in-flight slot

The combined preview worker MUST delete a preview's WAV and free its
in-flight slot once Panako has fingerprinted it and its other analyses are
done, and upload the fingerprints afterwards, one upload at a time.

#### Scenario: Other previews proceed during a slow upload
- **WHEN** `--max-in-flight 1` and the first preview's fingerprint upload takes several seconds
- **THEN** the next previews are downloaded and analysed before that upload ends

#### Scenario: A preview waiting for its upload is not fetched again
- **WHEN** a preview's upload is queued or running and the worker asks the queue for more previews
- **THEN** that preview is not downloaded again

#### Scenario: A failed upload leaves the preview queued
- **WHEN** the backend rejects a fingerprint upload
- **THEN** the worker carries on, and the preview still needs its fingerprint in the backend

### Requirement: Previews needing a fingerprint MUST NOT hold every in-flight slot

At most `--max-fingerprint-in-flight` in-flight previews (default half of
`--max-in-flight`) MUST be ones that need a fingerprint; while that many
are in flight, the worker MUST start pending previews that do not need one.

#### Scenario: Embedding-only previews pass fingerprint-bound ones
- **WHEN** the newest previews need fingerprints, uploads are slow, and older previews need only an embedding
- **THEN** the older previews are downloaded and analysed while the fingerprint uploads are still running

### Requirement: Queued uploads MUST be bounded

No new Panako run MUST start while `--max-queued-uploads` previews (default
8) are waiting for their upload.

#### Scenario: Uploads are the bottleneck
- **WHEN** uploads are slower than fingerprinting
- **THEN** the fingerprints held in memory are bounded by `--max-queued-uploads` plus the chunks already in Panako (`--fingerprint-workers` × `--fingerprint-chunk` previews)
