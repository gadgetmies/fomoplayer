# Tasks

Prerequisite: `replace-pydub-with-ffmpeg` is merged into `master` and merged into this branch.

## 1. Shared embedding module

- [x] 1.1 Add `analyser/embedding.py` (load model once; `embed_file(path) -> list[float]` doing decode → `MonoLoader` 16 kHz `resampleQuality=4` → model → per-patch mean) and `analyser/test_embedding.py` asserting cosine ≥ 0.9999 against the previous inline code on two fixture files; verify with `python -m unittest test_embedding`.
- [x] 1.2 Make both `main.py` paths (previews and `--audio-samples`) call `embedding.py`; verify by running `main.py --audio-samples` against a local backend with one seeded sample and checking the stored vector matches `embed_file` on the same file (cosine ≥ 0.9999).

## 2. Embedding service

- [x] 2.1 Add `analyser/embedding_service.py` (`GET /health`, `POST /embed`, token check in constant time, 401 without token, model loaded at start) and `analyser/test_embedding_service.py` starting it on a free port: valid request returns 1280 floats equal to `embed_file` on the same audio, missing or wrong token returns 401, undecodable body returns 422; verify with `python -m unittest test_embedding_service`.
- [x] 2.2 Add `analyser/Dockerfile` (Python 3.12 slim, see design.md, `ffmpeg`, model files, runs the service on `$PORT`) and a service-only requirements file; verify `docker build` succeeds and `curl /health` answers inside the container. Document running and deploying the service in `analyser/README.md`.

## 3. Backend admin job

- [x] 3.1 Add `EMBEDDING_SERVICE_URL`, `EMBEDDING_SERVICE_TOKEN` and `EMBEDDING_JOB_BATCH_SIZE` (default 20) to the backend config loader and `.env` examples; verify a backend test reads them and that no hostname literal is added to source.
- [x] 3.2 Add `packages/back/jobs/sample-embeddings.js` (`embedNotificationAudioSamples`): skipped result when unconfigured; otherwise read each pending sample from storage, POST to `/embed`, upsert with the production `EMBEDDING_TYPE`, collect per-sample errors; register it in `job-scheduling.js`. Add `packages/back/test/tests/jobs/sample-embeddings.js` (next to the other job tests) with a stub HTTP embedding service covering the spec scenarios (pending sample embedded and Sounds like no longer pending, nothing pending → no requests, one failing sample in three, unconfigured → skipped); verify with `cascade-test ./test/tests/jobs --regex 'sample-embeddings'`.
- [x] 3.3 Add the migration registering job `embedNotificationAudioSamples` with schedule `*/10 * * * *` and its down migration; verify `yarn migrate` up and down on the test database and that `GET /api/admin/jobs` lists the job.
- [x] 3.4 Start the job without awaiting after a successful upload in `POST /me/notifications/audio-samples`; extend the upload API test to assert the response does not wait for the job and a `job_run` row appears, and that an upload during a running job creates no second run; verify with the users test directory subset.

## 4. Integration

- [x] 4.1 Run the backend against a locally started embedding service (`docker run` from 2.2), upload a sample through the API and confirm its Sounds like request returns tracks instead of `pending` within one job run.
- [x] 4.2 Run the full suite (`yarn test`) and the analyser unit tests green before the merge.

## 5. Production deployment (agent, after the merge; confirm with the owner before each production change)

- [x] 5.1 Create the `embedding` service in the production environment of Railway project `fomoplayer` from this repository, building `analyser/Dockerfile`, with no public domain; verify its deployment succeeds and its logs show the model loaded.
- [x] 5.2 Generate a 32-byte token in the agent container and set it as `EMBEDDING_SERVICE_TOKEN` on `embedding`; set on the `fomoplayer` service `EMBEDDING_SERVICE_TOKEN=${{embedding.EMBEDDING_SERVICE_TOKEN}}` and `EMBEDDING_SERVICE_URL=http://${{embedding.RAILWAY_PRIVATE_DOMAIN}}:${{embedding.PORT}}`; verify both services redeploy and `embedding` logs no 401s from the backend.
- [x] 5.3 Start `embedNotificationAudioSamples` from admin Jobs (or wait for its schedule) and verify the run result shows samples processed or zero pending, and that a newly uploaded sample's Sounds like request stops returning `pending` within one run.

## Verification notes

- 1.1/1.2: `test_embedding.py` 3 passed (cosine ≥ 0.9999 against the old inline steps; WAV read as-is; too short → None). `test_main_audio_samples.py` runs `main.py --audio-samples` from another directory against a stub backend; the posted vector matches `embed_file` (the stub replaces the local backend the task named).
- 2.1: `test_embedding_service.py` 8 passed (vector equals the module's, WAV as-is, 401 for missing/wrong/empty token, 422 undecodable and too short, 413 oversized, refuses to start without a token).
- 2.2: image built (1.89 GB) and run with Docker; `/health` answers, `/embed` without a token is 401, and an MP3 embedded in the container matches the host module (cosine 0.99999999999999, max abs diff 7e-7). Runs as a non-root user.
- 3.1–3.4: `test/tests/jobs/sample-embeddings.js` 9 passed. Uploads need object storage, which the test environment lacks, so the after-upload start is tested through `startEmbeddingAfterUpload` with the real scheduler: a run starts without blocking, and none starts while one is in progress. Migration up, down and up on the test database.
- 4.1: the job against the real service container, the test database and a real MP3: the sample went from `pending` to embedded (1280 dimensions) and Sounds like stopped returning `pending`.
- 4.2: analyser tests 36 passed, 3 skipped (pydub comparison; two Panako integration tests need `panako` on PATH).
- 4.2: full backend suite (`yarn test`) 676 passed, 0 failed against a local Postgres 16 + pgvector 0.6.0 test database.
- 5.1: `embedding` service created in production on 2026-11-15 (root directory `/analyser`, health check `/health`, watch path `/analyser/**`, region `us-west2` next to the backend, no public domain); first deployment succeeded and its logs showed the model loaded and the health check answering.
- 5.2: token generated in the agent container and set on `embedding` with `PORT=8080`; the backend got both reference variables and redeployed. Its later run reached the service and stored a vector, so the token was accepted.
- 5.3: the first upload (sample 20, 2026-11-15 22:30 UTC) started the job at once but failed with `fetch failed`: this legacy Railway environment resolves `embedding.railway.internal` to IPv6 only and the service listened on IPv4. Fixed by `embedding-service-ipv6` (#456); the 22:50 UTC run then reached the service over IPv6 and stored the vector. On 2026-11-16 the owner confirmed in the app that the sample's Sounds like list is filled and the results look right.
- Follow-ups shipped as their own changes: `embedding-service-stdout-logs` (#454), `embedding-service-ipv6` (#456), `quiet-essentia-warnings` (#457).

## Workflow follow-up

- Archive the change after the production run in 5.3 is confirmed.
