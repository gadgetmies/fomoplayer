## 1. Switch the analyser

- [ ] 1.1 Pin `track-embedding` (git tag), add `samplerate` + `onnxruntime`, model download pinned by sha256
- [ ] 1.2 Comparison script: package vs stored vectors for ≥ 200 previews + 20 notification samples; record the result in this change (gate)
- [ ] 1.3 `embedding.py` / `embedding_service.py` / `main.py` on the package; drop `essentia-tensorflow` from requirements and the Dockerfile
- [ ] 1.4 Analyser tests incl. the conformance fixtures

## 2. Endpoints

- [ ] 2.1 Version mapping `EMBEDDING_VERSIONS`
- [ ] 2.2 `GET /api/embeddings/versions`
- [ ] 2.3 `POST /api/embeddings/similar-tracks` (validation, nearest-query-vector ranking on the HNSW index, API-key auth + rate limit)
- [ ] 2.4 Back-end API tests (ranking, 400, 401, 409)

## 3. Merge

- [ ] 3.1 Full suite green (`yarn test`); docs for the API
