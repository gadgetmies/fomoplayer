# Tasks

## 1. Silence Essentia warnings in the service

- [ ] 1.1 Add `quiet_essentia_warnings()` to `embedding_service.py`, call it in `main()`, and test in `test_embedding_service.py` (child process, one embedding) that the warning appears without the call and not with it, with identical vectors; verify with `pytest test_embedding_service.py`.

## Workflow follow-up

- After merge, check the `embedding` service's Railway logs for a request without the warning flood or a rate-limit message, then archive the change.
