# Proposal

## Why

The production `embedding` service runs with Railway's app sleeping on: it
stops when idle and starts on the next incoming connection. That first
connection is refused while the service starts, so the job started by an
upload failed with `fetch failed (ECONNREFUSED)` (sample 22 on 2026-11-16) and
the sample waited for the next scheduled run, up to 10 minutes. The owner
chose to keep sleeping on to save cost, and have the job wait for the service
to wake instead.

## What Changes

- When a request to the embedding service fails to connect (refused, reset,
  host unreachable), the job retries it with growing waits, about 30 seconds
  in all, long enough for the service to start and load its model.
- HTTP answers (401, 413, 422, …) are not retried: the service is up and has
  decided.
- If the service still cannot be reached after the retries, the rest of that
  run's samples are tried once each without waiting again, so a service that
  is really down does not stretch one run to many minutes.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `sample-embedding`: adds a requirement that the job waits for a sleeping
  embedding service to wake.

## Impact

- `packages/back/jobs/sample-embeddings.js`,
  `packages/back/test/tests/jobs/sample-embeddings.js`. No configuration or
  schema change; the analyser service is unchanged.
