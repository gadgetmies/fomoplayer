## ADDED Requirements

### Requirement: The embedding worker MUST keep its model loaded across batches

`analyser/main.py` MUST accept `--loop`. With it, the preview branch MUST keep
fetching and processing batches in one process, building the model at most
once, until the queue endpoint returns an empty list, and then exit with
status `2`. With `--idle-wait SECONDS` greater than 0 it MUST instead wait
that long on an empty queue and ask again, keeping the model loaded. A batch
that reports nothing MUST be followed by a 60 s wait before the next fetch.
`analyse_all.sh` MUST pass `--loop` and its own `--idle-wait` value to the
`embedding-previews` worker.

#### Scenario: Two batches, one model load
- **WHEN** `main.py --loop` runs and the queue serves two non-empty batches and then an empty one
- **THEN** both batches are embedded and reported, the model is built once, and the process exits `2`

#### Scenario: Idle wait keeps the model loaded
- **WHEN** `main.py --loop --idle-wait 120` finds the queue empty
- **THEN** it waits 120 s and asks again without exiting or building the model again

#### Scenario: Without --loop
- **WHEN** `main.py` runs without `--loop` and the queue serves a non-empty batch
- **THEN** it processes that batch only and exits `0`

### Requirement: Preview workers MUST prefetch in parallel without extra store traffic

`main.py` (previews) and `waveform.py` MUST download and decode the next items
of a batch on background threads while the current item is processed, with at
most `--download-workers` (default 4) concurrent bucket downloads and at most
`--download-workers + 1` items prepared ahead. Items MUST be processed and
reported in queue order. Any item whose preparation contacts a store (a
preview without stored audio) MUST be prepared on a single thread, one at a
time. Each downloaded file MUST be deleted once decoded.

#### Scenario: Stored previews download concurrently
- **WHEN** a batch holds only previews with stored audio and `--download-workers 4`
- **THEN** up to four downloads run at the same time, and results are processed in queue order

#### Scenario: Store downloads stay serial
- **WHEN** a batch holds previews without stored audio (e.g. `--direct-download`)
- **THEN** those previews are downloaded one at a time

### Requirement: The embedding worker MUST report a batch in one request

`main.py` (previews) MUST send a batch's embeddings and missing reports in one
`POST /admin/analyse`. If that request fails (non-200 status or network
error), it MUST resend the entries one per request. Entries collected before
the sanity checker stops the worker MUST be sent before it exits.

#### Scenario: One request per batch
- **WHEN** a batch of three tracks yields two embeddings and one missing preview
- **THEN** one `POST /admin/analyse` carries all three entries

#### Scenario: Fallback on a failed batch request
- **WHEN** the batch request answers 500
- **THEN** each entry is sent in its own request
