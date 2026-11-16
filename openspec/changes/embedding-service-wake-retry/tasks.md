# Tasks

## 1. Wait for a waking service

- [x] 1.1 Retry connection-level failures in `jobs/sample-embeddings.js` with injectable waits (default 1, 2, 4, 8, 16 s), no retry for HTTP answers, and no further waiting in a run after one exhausted sequence; cover the three spec scenarios in `test/tests/jobs/sample-embeddings.js` with zero-length waits; verify with `cascade-test ./test/tests/jobs --regex 'sample-embeddings'`.

## Verification notes

- 1.1: `test/tests/jobs/sample-embeddings.js` 13 passed, including: two refused connections then an answer (waits 10, 20; sample embedded in the same run), a 422 answered once with no wait, and a service refusing everything (first sample waits through all waits, the other two are tried once; all three failed with `fetch failed (ECONNREFUSED)`).
- Merge boundary: full backend suite (`yarn test`) 740 passed, 0 failed.

## Workflow follow-up

- After merge, let the `embedding` service sleep, upload a sample and confirm it is embedded within the same job run; then archive the change.
