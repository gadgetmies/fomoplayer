# Tasks

Prerequisite: `replace-pydub-with-ffmpeg` is merged into `master` and merged into this branch.

## 1. Shared embedding module

- [ ] 1.1 Add `analyser/embedding.py` (load model once; `embed_file(path) -> list[float]` doing decode → `MonoLoader` 16 kHz `resampleQuality=4` → model → per-patch mean) and `analyser/test_embedding.py` asserting cosine ≥ 0.9999 against the previous inline code on two fixture files; verify with `python -m unittest test_embedding`.
- [ ] 1.2 Make both `main.py` paths (previews and `--audio-samples`) call `embedding.py`; verify by running `main.py --audio-samples` against a local backend with one seeded sample and checking the stored vector matches `embed_file` on the same file (cosine ≥ 0.9999).

## 2. Embedding service

- [ ] 2.1 Add `analyser/embedding_service.py` (`GET /health`, `POST /embed`, token check in constant time, 401 without token, model loaded at start) and `analyser/test_embedding_service.py` starting it on a free port: valid request returns 1280 floats equal to `embed_file` on the same audio, missing or wrong token returns 401, undecodable body returns 422; verify with `python -m unittest test_embedding_service`.
- [ ] 2.2 Add `analyser/Dockerfile` (Python 3.13 slim, `ffmpeg`, model files, runs the service on `$PORT`) and a service-only requirements file; verify `docker build` succeeds and `curl /health` answers inside the container. Document running and deploying the service in `analyser/README.md`.

## 3. Backend admin job

- [ ] 3.1 Add `EMBEDDING_SERVICE_URL`, `EMBEDDING_SERVICE_TOKEN` and `EMBEDDING_JOB_BATCH_SIZE` (default 20) to the backend config loader and `.env` examples; verify a backend test reads them and that no hostname literal is added to source.
- [ ] 3.2 Add `packages/back/jobs/sample-embeddings.js` (`embedNotificationAudioSamples`): skipped result when unconfigured; otherwise read each pending sample from storage, POST to `/embed`, upsert with the production `EMBEDDING_TYPE`, collect per-sample errors; register it in `job-scheduling.js`. Add `packages/back/test/tests/admin/sample-embeddings-job.js` with a stub HTTP embedding service covering the spec scenarios (pending sample embedded and Sounds like no longer pending, nothing pending → no requests, one failing sample in three, unconfigured → skipped); verify with `cascade-test ./test/tests/admin --regex 'sample-embeddings-job'`.
- [ ] 3.3 Add the migration registering job `embedNotificationAudioSamples` with schedule `*/10 * * * *` and its down migration; verify `yarn migrate` up and down on the test database and that `GET /api/admin/jobs` lists the job.
- [ ] 3.4 Start the job without awaiting after a successful upload in `POST /me/notifications/audio-samples`; extend the upload API test to assert the response does not wait for the job and a `job_run` row appears, and that an upload during a running job creates no second run; verify with the users test directory subset.

## 4. Integration

- [ ] 4.1 Run the backend against a locally started embedding service (`docker run` from 2.2), upload a sample through the API and confirm its Sounds like request returns tracks instead of `pending` within one job run.
- [ ] 4.2 Run the full suite (`yarn test`) and the analyser unit tests green before the merge.

## 5. Production deployment (agent, after the merge; confirm with the owner before each production change)

- [ ] 5.1 Create the `embedding` service in the production environment of Railway project `fomoplayer` from this repository, building `analyser/Dockerfile`, with no public domain; verify its deployment succeeds and its logs show the model loaded.
- [ ] 5.2 Generate a 32-byte token in the agent container and set it as `EMBEDDING_SERVICE_TOKEN` on `embedding`; set on the `fomoplayer` service `EMBEDDING_SERVICE_TOKEN=${{embedding.EMBEDDING_SERVICE_TOKEN}}` and `EMBEDDING_SERVICE_URL=http://${{embedding.RAILWAY_PRIVATE_DOMAIN}}:${{embedding.PORT}}`; verify both services redeploy and `embedding` logs no 401s from the backend.
- [ ] 5.3 Start `embedNotificationAudioSamples` from admin Jobs (or wait for its schedule) and verify the run result shows samples processed or zero pending, and that a newly uploaded sample's Sounds like request stops returning `pending` within one run.

## Workflow follow-up

- Archive the change after the production run in 5.3 is confirmed.
