# Tasks

## 1. Reach the service over IPv6

- [ ] 1.1 Listen dual-stack on `::` by default in `embedding_service.py`, falling back to `0.0.0.0` when IPv6 is unavailable; test in `test_embedding_service.py` that the default listener answers on IPv4, answers on `[::1]` where IPv6 exists (skipped otherwise), and falls back when the IPv6 bind fails; verify with `pytest test_embedding_service.py`.

## 2. Show why a request failed

- [ ] 2.1 Append `error.cause`'s code or message to the job's per-sample error in `jobs/sample-embeddings.js`, with a test in `test/tests/jobs/sample-embeddings.js` for a `fetch failed` error carrying `ECONNREFUSED`; verify with `cascade-test ./test/tests/jobs --regex 'sample-embeddings'`.

## Workflow follow-up

- After merge and redeploy, confirm sample 20 (uploaded 2026-11-15 22:30 UTC) gets an embedding within one job run, then archive the change.
