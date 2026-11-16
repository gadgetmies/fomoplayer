# Tasks

## 1. Reach the service over IPv6

- [x] 1.1 Listen dual-stack on `::` by default in `embedding_service.py`, falling back to `0.0.0.0` when IPv6 is unavailable; test in `test_embedding_service.py` that the default listener answers on IPv4, answers on `[::1]` where IPv6 exists (skipped otherwise), and falls back when the IPv6 bind fails; verify with `pytest test_embedding_service.py`.

## 2. Show why a request failed

- [x] 2.1 Append `error.cause`'s code or message to the job's per-sample error in `jobs/sample-embeddings.js`, with a test in `test/tests/jobs/sample-embeddings.js` for a `fetch failed` error carrying `ECONNREFUSED`; verify with `cascade-test ./test/tests/jobs --regex 'sample-embeddings'`.

## Verification notes

- 1.1: `pytest test_embedding_service.py` 11 passed, 1 skipped: the IPv6 listener test skips here because this sandbox has no IPv6 (`AF_INET6` → EAFNOSUPPORT); the fallback test forces the IPv6 bind to fail and the service still answers on IPv4.
- 2.1: `sample-embeddings.js` job tests 10 passed, incl. `fetch failed (ECONNREFUSED)`.
- Merge boundary: full backend suite (`yarn test`) 677 passed, 0 failed.

## Workflow follow-up

- After merge and redeploy, confirm sample 20 (uploaded 2026-11-15 22:30 UTC) gets an embedding within one job run, then archive the change.

## Post-merge check

- 2026-11-15 22:45 UTC: the service logs `listening on :: port 8080` and answers Railway's IPv4 health check as `::ffff:100.64.0.1`. The 22:50 UTC job run reached it over the IPv6 private network and stored sample 20's vector; on 2026-11-16 the owner confirmed the sample's Sounds like list in the app.
