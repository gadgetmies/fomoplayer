# Tasks

## 1. Log requests to stdout

- [x] 1.1 Write the request log line to stdout in `embedding_service.py` and add a test in `test_embedding_service.py` that a request's log line appears on stdout and not on stderr; verify with `pytest test_embedding_service.py`.

## Verification notes

- 1.1: the new test fails on the old code (request line on stderr) and passes with the fix; `pytest test_embedding_service.py` 9 passed.
- Merge boundary: full backend suite (`yarn test`) 676 passed, 0 failed.

## Workflow follow-up

- After merge, check the `embedding` service's Railway logs show request lines at info level.
- Archive the change after merge.

## Post-merge check

- 2026-11-16 07:49 UTC: after the `embedding` service redeployed, its Railway logs show request lines (`"GET /health HTTP/1.1" 200`) at info level.
