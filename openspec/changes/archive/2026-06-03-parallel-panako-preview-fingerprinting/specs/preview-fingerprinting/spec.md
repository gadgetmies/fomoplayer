## ADDED Requirements

### Requirement: Previews in a fetched batch MUST be fingerprinted in parallel

The `panako_processor.py --previews` worker MUST fetch one batch from the API queue and fingerprint the previews in that batch concurrently across a configurable number of worker processes, replacing the serial per-preview loop. The number of worker processes MUST be controlled by a `--workers N` flag that defaults to `4`. The fetched batch (size `--batch-size`) MUST be split into at most `--workers` sub-batches, each fingerprinted by one process.

#### Scenario: Default invocation uses four workers

- **WHEN** `panako_processor.py --previews` is run with no `--workers` flag
- **THEN** the fetched batch is processed across 4 parallel worker processes

#### Scenario: Worker count is configurable

- **WHEN** `panako_processor.py --previews --workers 8 --batch-size 40` is run
- **THEN** the 40 fetched previews are divided among 8 worker processes, each running a single batched Panako `store` + `resolve` over its sub-batch

#### Scenario: Single worker still uses the parallel code path

- **WHEN** `panako_processor.py --previews --workers 1` is run
- **THEN** the whole batch is fingerprinted by one process in a single batched Panako invocation (no serial per-file fallback path)

#### Scenario: Produced fingerprints match the serial path

- **WHEN** a preview is fingerprinted through the parallel worker
- **THEN** the fingerprints uploaded for that preview are identical to those the previous serial path would have produced

### Requirement: Each parallel worker MUST use an isolated Panako cache

Every worker process MUST run Panako against its own `PANAKO_CACHE_FOLDER`, isolated per process (keyed by PID), so concurrent `panako store` invocations never share LMDB state. Because each cache starts empty, the worker MUST NOT perform the per-file `resolve → delete` dedup step; it stores fresh.

#### Scenario: Concurrent workers do not share a cache folder

- **WHEN** multiple worker processes fingerprint sub-batches concurrently
- **THEN** each process uses a distinct `PANAKO_CACHE_FOLDER` and no process reads or writes another's cache

### Requirement: Per-file and per-sub-batch failures MUST be isolated

A failure fingerprinting or uploading one preview MUST NOT prevent the other previews in its sub-batch from completing, and a crashed sub-batch MUST NOT abort the overall run. Failures MUST be logged with the affected preview id, and the run MUST continue. Previews that fail are simply left without fingerprints and reappear in a later fetch.

#### Scenario: One bad file does not sink its sub-batch

- **WHEN** one preview in a sub-batch fails to download, convert, fingerprint, or upload
- **THEN** the remaining previews in that sub-batch are still fingerprinted and uploaded, and the failure is logged with the preview id

#### Scenario: A crashed sub-batch does not abort the run

- **WHEN** an entire sub-batch's worker process raises
- **THEN** the failure is logged and the remaining sub-batches still complete

### Requirement: `--score-after` MUST fire on cumulative completion regardless of order

The parent process MUST tally successfully-uploaded previews as worker results return, and MUST invoke the global server-side scoring pass (`run_server_side_scoring`) once each time the cumulative count crosses a multiple of `--score-after`. Because scoring is a single global, idempotent server operation, out-of-order worker completion MUST NOT affect when or how often it fires. Worker processes MAY continue fingerprinting while a scoring pass is in flight.

#### Scenario: Scoring fires once per threshold crossing

- **WHEN** `--score-after 1000` is set and 2300 previews are successfully uploaded across out-of-order worker completions
- **THEN** the parent fires the server-side scoring pass exactly twice (at the 1000 and 2000 cumulative crossings)

#### Scenario: Below-threshold run does not score mid-run

- **WHEN** `--batch-size 10 --score-after 1000` is set
- **THEN** no scoring pass fires within the invocation (cumulative count never reaches 1000)

### Requirement: `analyse_all.sh` MUST expose the worker count for previews

`analyse_all.sh` MUST accept a `--fingerprint-workers N` option that passes `--workers N` through to the `fingerprint-previews` worker only. When the option is omitted, the flag MUST NOT be passed, so the worker's own default (4) applies. Other spawned workers MUST be unaffected.

#### Scenario: Pass-through to the previews worker

- **WHEN** `analyse_all.sh --previews --fingerprint-workers 6` is run
- **THEN** the `fingerprint-previews` worker command includes `--workers 6` and no other worker command is changed

#### Scenario: Omitted option falls back to the worker default

- **WHEN** `analyse_all.sh --previews` is run without `--fingerprint-workers`
- **THEN** the `fingerprint-previews` worker command contains no `--workers` flag and runs with the default of 4
