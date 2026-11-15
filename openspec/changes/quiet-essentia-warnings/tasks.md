# Tasks

## 1. Silence Essentia warnings in the service

- [x] 1.1 Add `quiet_essentia_warnings()` to `embedding_service.py`, call it in `main()`, and test in `test_embedding_service.py` (child process, one embedding) that the warning appears without the call and not with it, with identical vectors; verify with `pytest test_embedding_service.py`.

## Verification notes

- Reproduced: one 12-second clip printed the warning 2,083 times; with `essentia.log.warningActive = False` it printed none and the vector was bit-identical.
- 1.1: `pytest test_embedding_service.py` 12 passed, 1 skipped (IPv6 listener test; this sandbox has no IPv6). The new test's control run shows the warning without the switch.
- Merge boundary: full backend suite (`yarn test`) 677 passed, 0 failed.

## Workflow follow-up

- After merge, check the `embedding` service's Railway logs for a request without the warning flood or a rate-limit message, then archive the change.
