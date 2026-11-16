# Tasks

## 1. Wait for a waking service

- [ ] 1.1 Retry connection-level failures in `jobs/sample-embeddings.js` with injectable waits (default 1, 2, 4, 8, 16 s), no retry for HTTP answers, and no further waiting in a run after one exhausted sequence; cover the three spec scenarios in `test/tests/jobs/sample-embeddings.js` with zero-length waits; verify with `cascade-test ./test/tests/jobs --regex 'sample-embeddings'`.

## Workflow follow-up

- After merge, let the `embedding` service sleep, upload a sample and confirm it is embedded within the same job run; then archive the change.
