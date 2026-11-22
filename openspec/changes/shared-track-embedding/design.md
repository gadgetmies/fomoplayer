## Context

- `analyser/embedding.py` decodes with `audio_decode.to_wav` (FFmpeg → `pcm_s16le` WAV) and Essentia's
  `MonoLoader(sampleRate=16000, resampleQuality=4)` + `TensorflowPredictEffnetDiscogs` (`PartitionedCall:1`), mean over
  patches. Vectors live in `store__track_preview_embedding` (type enum, HNSW cosine index) and
  `user_notification_audio_sample_embedding`.
- Harmonia's measurement (2026-11-22): the ONNX model + numpy front-end on the same samples = cosine 1.0000000; FFmpeg
  16-bit → /32768 → channel mean → libsamplerate linear = ≥ 0.9999967 against stored fomoplayer vectors.

## Decisions

### D1 — Version 1 is what is stored; the switch is gated on a comparison

The package is accepted only when its vectors match stored ones (cosine ≥ 0.99999) for a sample of at least 200
previews across formats and sample rates and 20 notification samples. If that fails, the analyser keeps Essentia and
the gap is reported; the specification would then be wrong about fomoplayer, not the data.

### D2 — Version is a mapping, not a migration

`EMBEDDING_VERSIONS = { 'discogs_multi_embeddings-effnet-bs64-1': 'track-embedding/1' }`. The endpoints speak
versions; queries filter by the mapped type. No column, no rewrite of 77,000 rows.

### D3 — Nearest query vector ranking

Several query vectors rank each preview by its smallest distance to any of them, the same shape as cart similarity
search's per-group searches; one SQL query per request using `LATERAL` over the query vectors and the HNSW index,
merged by minimum distance. A mean-of-vectors query was rejected (a two-style crate averages into neither).

### D4 — API keys, not cookies

The routes accept the existing user API keys (`Authorization: Bearer`), counted by the API-key rate limiter. Harmonia
obtains the key with the existing `/api-keys/exchange-handoff` browser hand-off.

## Risks / Trade-offs

- [Vectors reveal a user's library] → nothing is stored from a request; requests are not logged beyond counts.
- [libsamplerate differs across builds] → tolerance, not bit equality; fixtures run in both suites.
- [Previews vs full tracks] → measured by `preview-vs-full-track-embeddings`; a later version may embed a window.

### D5 — Same exclusions as the cart similarity search

Results leave out the tracks the API key's user has heard, ignores (artist, label, release, artist on label) or bought,
as the cart similarity search does; the index pool per query vector is five times the limit so the exclusions rarely
shorten the list.

## Open Questions

- None for this change. Whether heard tracks should be left out for a desktop client too is an owner decision recorded
  with the implementation (D5 follows the cart similarity search until decided otherwise).
