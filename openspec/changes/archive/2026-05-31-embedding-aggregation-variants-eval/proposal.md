> **Outcome (2026-05-31): eval concluded — production aggregation stays `mean`.**
> `trimmed_mean` was indistinguishable from `mean` and `mean_std`'s differences couldn't be
> shown to be improvements without labelled data, so the variant scaffolding (Parts B–E) was
> **reverted**. Only the review fixes (Part A: cosine distance, embedding-type filter, analyser
> model-name fix) shipped. Full results in [FINDINGS.md](FINDINGS.md). The capability specs
> below describe the experiment as evaluated, not the shipped state.

## Why

The Essentia Discogs-EffNet track-similarity search ranks with Euclidean distance (`<->`) over un-normalized, mean-pooled embeddings, doesn't filter by embedding type, and records the wrong model name on one ingestion path — so rankings are skewed and cross-model vectors can be compared. We also want to know whether a better temporal aggregation than plain mean (trimmed-mean, mean⊕std) improves similarity, but there is no way to generate, store, serve, or visually inspect alternative aggregations.

## What Changes

- Fix similarity search to rank by **cosine distance** (`<=>`) instead of Euclidean (`<->`).
- Fix similarity search to **filter by embedding type**, so only same-model vectors are compared and the reference vector is deterministic.
- Fix the analyser preview branch to record the **model actually used** (currently sends `null` when `-m` is omitted, risking a NOT NULL `EMBEDDING_TYPE` failure / mislabel).
- Add temporal-aggregation **variant methods** to the analyser: `mean`, `trimmed_mean` (10% trim), and `mean_std` (mean⊕std, 2560-d).
- Add a **temporary eval table** to store variant embeddings (unfixed-dim vector, no ANN index).
- Add an `--eval-variants` analyser flag that computes all variants and POSTs them to a new admin endpoint.
- Generate **per-track visualizations** (temporal heatmap + ~50px-wide variant strips, shared colormap/axis) under the eval flag.
- Add a temporary **`variant:` search token** so the existing similarity search UI can run against any stored variant with no frontend change.
- **Deferred:** after the eval concludes, add an **HNSW cosine index** to the production `store__track_preview_embedding` column.

## Capabilities

### New Capabilities
- `track-similarity-search`: Embedding-based "similar tracks" search behavior — cosine ranking, embedding-type filtering, the temporary variant selector token, and the deferred production ANN index.
- `embedding-variant-eval`: Analyser-side temporal-aggregation variants (mean / trimmed-mean / mean⊕std), their temporary storage table and ingestion endpoint, the `--eval-variants` generation flag, and the per-track visualizations.

### Modified Capabilities
<!-- None: no existing spec covers similarity search or embedding generation. -->

## Impact

- **Backend search**: `packages/back/routes/shared/db/search.js` (cosine, type filter, `variant:` token).
- **Analyser**: `analyser/main.py` (model-name bug fix, variant aggregation, `--eval-variants`, visualizations); new `analyser/embedding_variants.py` helper; visualization output under `analyser/eval/embedding_viz/`.
- **Admin API/DB**: new `POST /admin/embedding-variants` endpoint + upsert in `packages/back/routes/admin/`.
- **Migrations**: new temporary `store__track_preview_embedding_variant` table (with down-migration); deferred HNSW index migration on `store__track_preview_embedding`.
- **Dependencies**: a Python plotting lib for visualizations (matplotlib or Pillow — confirmed at implementation time); pgvector `vector_cosine_ops` / `hnsw` (already available).
- **No frontend changes**; the `variant:` token rides the existing search box.
