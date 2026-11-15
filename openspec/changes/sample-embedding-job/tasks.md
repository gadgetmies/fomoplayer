# Tasks

## 1. Replace pydub with an ffmpeg helper

- [ ] 1.1 Add `analyser/audio_decode.py` with `to_wav(src, dst, max_seconds=None)` per design.md, and `analyser/test_audio_decode.py` that decodes fixture `.mp3`, `.wav` and `.LOFI` files with both `pydub` and the helper and asserts identical sample rate, channels and PCM samples; verify with `python -m unittest test_audio_decode` (run under Python 3.12, or 3.13 with `audioop-lts` installed only for this comparison).
- [ ] 1.2 Switch every `pydub` call site (`main.py` ×2, `panako_processor.py`, `waveform.py`, `extraction.py` keeping its duration cap, `run_fingerprint_and_report.py`, `eval/extraction.py`) to the helper; verify `grep -rn pydub analyser --include=*.py` finds only the comparison test, and the existing `test_cleanup`, `test_parallel_preview_fingerprinting` and `test_auth_resolve_url` tests pass.
- [ ] 1.3 Remove `pydub` from `analyser/requirements.txt`, make the comparison test skip when `pydub` is absent, update the two `pydub` mentions in `analyser/README.md`; verify a fresh Python 3.13 venv from `requirements.txt` runs `python main.py --help` without `audioop-lts`.

## 2. Shared embedding module

- [ ] 2.1 Add `analyser/embedding.py` (load model once; `embed_file(path) -> list[float]` doing decode → `MonoLoader` 16 kHz `resampleQuality=4` → model → per-patch mean) and `analyser/test_embedding.py` asserting cosine ≥ 0.9999 against the previous inline code on two fixture files; verify with `python -m unittest test_embedding`.
- [ ] 2.2 Make both `main.py` paths (previews and `--audio-samples`) call `embedding.py`; verify by running `main.py --audio-samples` against a local backend with one seeded sample and checking the stored vector matches `embed_file` on the same file (cosine ≥ 0.9999).

## 3. Embedding service

- [ ] 3.1 Add `analyser/embedding_service.py` (`GET /health`, `POST /embed`, token check in constant time, 401 without token, model loaded at start) and `analyser/test_embedding_service.py` starting it on a free port: valid request returns 1280 floats equal to `embed_file` on the same audio, missing or wrong token returns 401, undecodable body returns 422; verify with `python -m unittest test_embedding_service`.
- [ ] 3.2 Add `analyser/Dockerfile` (Python 3.13 slim, `ffmpeg`, model files, runs the service on `$PORT`) and a service-only requirements file; verify `docker build` succeeds and `curl /health` answers inside the container. Document running and deploying the service in `analyser/README.md`.

## 4. Backend admin job

- [ ] 4.1 Add `EMBEDDING_SERVICE_URL`, `EMBEDDING_SERVICE_TOKEN` and `EMBEDDING_JOB_BATCH_SIZE` (default 20) to the backend config loader and `.env` examples; verify the config unit test or a backend test reads them and that no hostname literal is added to source.
- [ ] 4.2 Add `packages/back/jobs/sample-embeddings.js` (`embedNotificationAudioSamples`): skipped result when unconfigured; otherwise read each pending sample from storage, POST to `/embed`, upsert with the production `EMBEDDING_TYPE`, collect per-sample errors; register it in `job-scheduling.js`. Add `packages/back/test/tests/admin/sample-embeddings-job.js` with a stub HTTP embedding service covering the spec scenarios (pending sample embedded and Sounds like no longer pending, nothing pending → no requests, one failing sample in three, unconfigured → skipped); verify with `cascade-test ./test/tests/admin --regex 'sample-embeddings-job'`.
- [ ] 4.3 Add the migration registering job `embedNotificationAudioSamples` with schedule `*/10 * * * *` and its down migration; verify `yarn migrate` up and down on the test database and that `GET /api/admin/jobs` lists the job.
- [ ] 4.4 Start the job without awaiting after a successful upload in `POST /me/notifications/audio-samples`; extend the upload API test to assert the response does not wait for the job and a `job_run` row appears, and that an upload during a running job creates no second run; verify with the users test directory subset.

## 5. Integration

- [ ] 5.1 Run the backend against a locally started embedding service (`docker run` from 3.2), upload a sample through the API and confirm its Sounds like request returns tracks instead of `pending` within one job run.
- [ ] 5.2 Run the full suite (`yarn test`) and the analyser unit tests green before the merge.

## Workflow follow-up

- Owner actions after merge (not for the agent): create the production Railway service from `analyser/Dockerfile` with no public domain; generate the shared token and set `EMBEDDING_SERVICE_TOKEN` on the service and the backend; set `EMBEDDING_SERVICE_URL` on the backend to the service's private address.
- After deploy, confirm the first `embedNotificationAudioSamples` run in admin Jobs embedded any pending samples, then archive the change.
