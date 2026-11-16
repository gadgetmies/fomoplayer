# Proposal

## Why

The embedding service (`analyser/embedding_service.py`, deployed by
`sample-embedding-job`) writes one line per request to stderr. Railway marks
every stderr line as an error, so routine `GET /health` and `POST /embed`
lines show up as errors in the production logs and hide the real ones.

## What Changes

- The per-request log line goes to stdout, flushed per line.
- Tracebacks of requests that fail while embedding stay on stderr, so Railway
  still flags those as errors.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. Logging only; the change sets `skip_specs: true`.

## Impact

- `analyser/embedding_service.py`, `analyser/test_embedding_service.py`.
  Takes effect when the `embedding` Railway service redeploys (its watch path
  is `/analyser/**`).
