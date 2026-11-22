## Why

Harmonia, the owner's desktop DJ library, embeds the user's own tracks with the same Discogs-EffNet model fomoplayer
uses for store previews. After this change a Harmonia user can ask fomoplayer for tracks that sound like tracks in
their library or a crate they are planning a set from, without uploading audio: Harmonia sends the vectors, fomoplayer
ranks its previews against them.

For the vectors to be comparable both applications must embed the same way, and keep doing so while each evolves (a
fine-tuned model is planned here). A shared, versioned specification with one reference implementation does that.
Version 1 is exactly what the analyser stores today, so no stored vector changes.

## What Changes

- **The analyser and the embedding service compute embeddings through the shared `track_embedding` package**
  (sibling repository `../track-embedding`, pinned by git tag): FFmpeg 16-bit decode at the source rate, channel
  mean, libsamplerate linear resample to 16 kHz, the numpy mel front-end and the ONNX Discogs-EffNet model.
  **Essentia and TensorFlow leave the analyser** (`essentia-tensorflow` is used only for embeddings). Before the switch
  the package's vectors are compared with stored ones on a sample of previews and samples; the switch needs cosine
  ≥ 0.99999 on every one.
- **Stored vectors are labelled with their specification version.** The existing type
  `discogs_multi_embeddings-effnet-bs64-1` is defined as `track-embedding/1` (a mapping in code, no data migration).
  A future model is a new version and a new type; both may be stored side by side during a re-embed.
- **`GET /api/embeddings/versions`**: the versions this instance indexes, with coverage (`preview`) and counts.
- **`POST /api/embeddings/similar-tracks`**: `{ version, coverage, vectors: [[1280 numbers], …] (1–50), limit
  (≤ 200) }` → tracks ranked by cosine distance to the nearest query vector, using the existing HNSW index; with
  artist, title, label, release date, store links and the track's fomoplayer URL. Authenticated by a user API key and
  rate-limited like the other API-key routes. A version this instance does not index answers `409
  embedding_version_unsupported` with the indexed versions.
- Unchanged: preview embedding coverage, cart similarity search, sounds-like sample search, the analyser's
  scheduling, the database schema.

## Capabilities

### New Capabilities

- `track-embedding-search`: version listing and vector search for clients that hold their own embeddings.

### Modified Capabilities

- `sample-embedding`: sample and preview embeddings come from the shared reference package.

## Impact

- Code: `analyser/embedding.py`, `analyser/embedding_service.py`, `analyser/main.py`, `analyser/audio_decode.py`
  (decode now in the package), requirements and `analyser/Dockerfile`; back end routes under `routes/users` (or a new
  `routes/embeddings`), a query beside `sample-similarity.js`, tests.
- Dependencies: `track-embedding` (git tag), `samplerate`, `onnxruntime`; drops `essentia-tensorflow`. The model files
  are downloaded and pinned by sha256 (CC BY-NC-SA 4.0, as today).
- Other repositories: `../track-embedding` (new), Harmonia change `shared-track-embedding` (the client).
