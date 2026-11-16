# Proposal

## Why

The first production upload after `sample-embedding-job` deployed failed to
embed: the backend's request to the embedding service ended in
`fetch failed`. The service listens on `0.0.0.0` (IPv4 only), but in Railway's
legacy environments, which include this project's production, private DNS names
such as `embedding.railway.internal` resolve to IPv6 addresses only, so the
backend cannot connect. Railway's own health check uses IPv4 and kept passing,
which hid the problem. The job's log line showed only `fetch failed`, without
the network-level cause.

## What Changes

- The embedding service listens dual-stack (IPv6 `::`, also accepting IPv4) by
  default, and falls back to IPv4 `0.0.0.0` on hosts without IPv6.
- The job's per-sample error includes the network-level cause (for example
  `fetch failed (ECONNREFUSED)`), in the run result and the log.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. Deployment fix and error detail; the change sets `skip_specs: true`.

## Impact

- `analyser/embedding_service.py`, `analyser/test_embedding_service.py`,
  `packages/back/jobs/sample-embeddings.js`,
  `packages/back/test/tests/jobs/sample-embeddings.js`.
- Takes effect when the `embedding` and `fomoplayer` Railway services
  redeploy on merge; the failed sample is retried by the next job run.
