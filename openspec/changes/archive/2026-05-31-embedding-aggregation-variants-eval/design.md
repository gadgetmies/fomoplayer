## Context

The analyser (`analyser/main.py`) generates 1280-d Discogs-EffNet embeddings by mean-pooling the model's per-patch temporal output (`embeddings.T.mean(1)`) and POSTs them to the backend, which stores them in `store__track_preview_embedding (VECTOR(1280), EMBEDDING_TYPE enum)`. The "similar tracks" search (`packages/back/routes/shared/db/search.js`, triggered by a `track:~<id>` token typed into the search box) ranks candidates with pgvector's Euclidean operator `<->`.

Three correctness problems exist today: (1) Euclidean ranking over un-normalized vectors is not direction-aware, whereas EffNet similarity conventionally uses cosine; (2) the `reference` and `similar_tracks` CTEs don't filter on `store__track_preview_embedding_type`, so once a second embedding type is populated they compare across models and the `LIMIT 1` reference is nondeterministic; (3) the analyser preview branch records `"model": args.model` (None when `-m` is omitted) instead of the model actually used.

Separately, we want to evaluate whether trimmed-mean or mean⊕std aggregation beats plain mean — qualitatively, by running the real search UI against each variant and inspecting per-track visualizations. There is no labeled similarity ground-truth, so this is a visual/exploratory eval, not a metric-driven one.

## Goals / Non-Goals

**Goals:**
- Correct the production similarity search: cosine ranking, embedding-type filtering, deterministic reference.
- Fix the analyser model-name bug.
- Let an operator generate `mean` / `trimmed_mean` / `mean_std` variants, store them, and run the existing similarity search UI against any of them via a temporary token.
- Produce a per-track image comparing the raw temporal embedding matrix with each aggregated variant.
- Sequence a production HNSW cosine index as a deferred step after the eval.

**Non-Goals:**
- No quantitative precision/recall metrics and no labeled-pair dataset.
- No change to the production aggregation method (stays `mean`) as part of this change; swapping it is a possible *outcome* of the eval, done later.
- No frontend code changes.
- No ANN index on the eval table.

## Decisions

**Cosine via operator swap, not normalization.** Replace `<->` with `<=>` in `search.js`. pgvector's cosine operator normalizes internally, so stored vectors need no normalization step. Alternative (L2-normalize before storage, keep `<->`) was rejected: it requires re-embedding and an ingestion change for no ranking benefit over `<=>`.

**Embedding-type filter as a constant.** Both CTEs gain `store__track_preview_embedding_type = 'discogs_multi_embeddings-effnet-bs64-1'` (the only production type). Hardcoding is acceptable now and documented; parameterizing is unnecessary until a second production type ships.

**Separate, unfixed-dim eval table.** `store__track_preview_embedding_variant(store__track_preview_id, store__track_preview_embedding_variant_name TEXT, store__track_preview_embedding_variant_vector VECTOR, …_updated_at, UNIQUE(id, name))`. A dimensionless `VECTOR` column holds both the 1280-d (`mean`, `trimmed_mean`) and 2560-d (`mean_std`) vectors in one table. Naming follows the repo's conventions (FK column = parent PK name; non-FK columns table-prefixed) so `... NATURAL JOIN store__track_preview_embedding_variant` composes. Rejected: extending `EMBEDDING_TYPE` + reusing `VECTOR(1280)` — can't hold 2560-d and pollutes production.

**`variant:` search token, not a query param or dropdown.** Parsed exactly like `track:~`: `const embeddingVariant = originalQueryString.match(/variant:(\w+)/)?.[1]`. When present with `track:~`, the `reference`/`similar_tracks` CTEs read from the variant table filtered by name; otherwise the production path is untouched. Rides the existing search box → zero frontend work and trivially removable. The field-filter regex already strips `variant:...` from the text query, so it's inert elsewhere.

**Visualizations generated in Python, under the eval flag only.** Only the analyser holds the temporal matrix (the backend never receives it), so images are written there. Layout: dimensions on the Y axis (1280 rows; `mean_std` shown as 2560), temporal heatmap with patches/time on X, then each variant as a ~50px-wide strip sharing one colormap and normalization so strips line up row-for-row with the heatmap. Output: `analyser/eval/embedding_viz/<preview_id>.png`.

**Deferred HNSW index.** After the eval, a separate migration adds `USING hnsw (store__track_preview_embedding vector_cosine_ops)` on the fixed-dim production column. Sequenced last because choosing a different production aggregation would repopulate the column first.

## Risks / Trade-offs

- **Cosine swap changes existing result ordering** → Acceptable and intended; it's the conventional metric. No data migration needed.
- **Hardcoded embedding-type constant drifts if a new production model ships** → Documented inline; the filter is a single literal that's easy to parameterize later.
- **Eval table seq-scans (no index)** → Fine for a bounded eval batch; not a production path.
- **`mean_std` (2560-d) can't share an ANN index with 1280-d variants** → By design the eval table is unindexed; only the production 1280-d column gets the deferred HNSW index.
- **New Python plotting dependency** → Confirm matplotlib vs Pillow at implementation; prefer whichever is already importable to avoid adding a dep.
- **Eval scaffolding left in the tree** → Mitigated by clear "eval-only" marking, a down-migration that drops the table, and an inert/removable `variant:` token.

## Migration Plan

1. Ship Part A (cosine + type filter + model-name fix) — behavioral, no schema change.
2. Add the eval table (up + down migrations).
3. Deploy analyser variant generation + `--eval-variants` + visualizations and the admin endpoint.
4. Run the eval (generate variants for a batch, inspect images, search with `variant:` token).
5. **Deferred:** add the production HNSW cosine index; optionally drop the eval table and `variant:` token once conclusions are drawn.

Rollback: Part A reverts by restoring `<->` and removing the filter; eval scaffolding reverts via the down-migration and removing the endpoint/flag/token.

## Open Questions

- Plotting library: matplotlib or Pillow — decided at implementation based on what's already available in the analyser environment.
- Trim fraction for `trimmed_mean` defaults to 10% per tail; revisit only if the eval suggests it matters.
