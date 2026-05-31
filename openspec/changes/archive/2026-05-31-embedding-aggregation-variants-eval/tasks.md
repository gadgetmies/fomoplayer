> **Outcome (2026-05-31):** eval ran over all 2870 downloadable previews and concluded
> production stays `mean` (see [FINDINGS.md](FINDINGS.md)). **Part A shipped**; the variant
> scaffolding (Parts B–E: eval table, ingestion endpoint, `--eval-variants`, visualizations,
> `variant:` search token, and all Python eval scripts) was **reverted/removed**. Part F
> (HNSW index) and a labelled `mean` vs `mean_std` eval remain available if revisited.

## 1. Production search fixes (Part A)

- [x] 1.1 In `search.js`, change the similarity distance operator from `<->` to `<=>` in both the `similar_tracks` SELECT and the `ORDER BY` (lines ~146 and ~212)
- [x] 1.2 In `search.js`, add `store__track_preview_embedding_type = 'discogs_multi_embeddings-effnet-bs64-1'` to both the `reference` CTE and the `similar_tracks` CTE, with an inline comment noting the hardcoded production type
- [x] 1.3 In `analyser/main.py` preview branch (~line 386), send `"model": model_name` instead of `"model": args.model`
- [x] 1.4 Manually verify: run a `track:~<id>` search and confirm results return ordered by cosine distance with no cross-type comparison — verified via the variant path (identical cosine SQL), which returns 0-distance self + ascending cosine order. Production no-variant path not exercised locally because `store__track_preview_embedding` has 0 rows on this DB

## 2. Variant eval table (Part B)

- [x] 2.1 Add up-migration creating `store__track_preview_embedding_variant` (`store__track_preview_id` FK, `store__track_preview_embedding_variant_name TEXT`, `store__track_preview_embedding_variant_vector VECTOR` unfixed-dim, `…_updated_at TIMESTAMPTZ DEFAULT NOW()`, `UNIQUE(store__track_preview_id, …_variant_name)`)
- [x] 2.2 Add matching down-migration that drops the table
- [x] 2.3 Run the migration locally and confirm the table accepts both 1280-d and 2560-d vectors — applied via `npm run migrate`; verified inserts of 1280-d and 2560-d vectors

## 3. Analyser variant generation (Part C)

- [x] 3.1 Create `analyser/embedding_variants.py` with `aggregate(matrix, method)` implementing `mean`, `trimmed_mean` (10% per-tail, numpy only), and `mean_std` (concat → 2560-d) — math unit-verified
- [x] 3.2 Refactor `analyser/main.py` to build the model once and add `compute_temporal_embedding(path)` returning the `(n_patches, 1280)` matrix
- [x] 3.3 Add the `--eval-variants` CLI flag to `main.py`
- [x] 3.4 Under `--eval-variants`, compute all three variants per preview and POST them to the new variant endpoint
- [ ] 3.5 Confirm a normal (non-eval) run is unchanged _(verified by inspection: non-eval path still computes mean → POST /admin/analyse identically; not executed — needs Essentia + audio + backend)_

## 4. Variant ingestion endpoint (Part C backend)

- [x] 4.1 Add `upsertPreviewEmbeddingVariant(previewId, variantName, vector)` in `packages/back/routes/admin/db.js`
- [x] 4.2 Add `POST /admin/embedding-variants` route in `packages/back/routes/admin/api.js` that upserts each submitted variant row
- [x] 4.3 Confirm an eval run populates the variant table for all three variants — ran `eval_runner.py` (batch 5); table holds 5 `mean` (1280-d), 5 `trimmed_mean` (1280-d), 5 `mean_std` (2560-d)

## 5. Per-track visualizations (Part D)

- [x] 5.1 Confirm available plotting lib (matplotlib vs Pillow) in the analyser environment and pin the choice — matplotlib (already in `requirements.txt`)
- [x] 5.2 Implement visualization: temporal heatmap (dims on Y, patches on X) + per-variant ~50px-wide strips, shared colormap and normalization, aligned dimension axis
- [x] 5.3 Write output to `analyser/eval/embedding_viz/<preview_id>.png` under `--eval-variants`
- [x] 5.4 Generate images for a sample batch and visually confirm strips align row-for-row with the heatmap — confirmed with a gradient test render

## 6. Variant search token (Part E)

- [x] 6.1 In `search.js`, parse `const embeddingVariant = originalQueryString.match(/variant:(\w+)/)?.[1]`
- [x] 6.2 When `embeddingVariant` is set with a `track:~` search, point the `reference`/`similar_tracks` CTEs at `store__track_preview_embedding_variant` filtered by variant name (still cosine `<=>`); leave the production path unchanged otherwise
- [x] 6.3 Verify `variant:` is stripped from text matching and inert for non-similarity queries — existing field-filter regex strips `variant:<name>`; `variant` is not in the id-filter key set
- [x] 6.4 Manually verify: `track:~<id> variant:trimmed_mean` and `… variant:mean_std` each return cosine-ranked results from the variant table — `GET /api/tracks/?q=track:~683 variant:<name>` for mean / trimmed_mean / mean_std each returned 5 cosine-ranked results (self at 0), with variants producing different distances/ordering

## 7. Deferred production index (Part F — after eval)

- [ ] 7.1 After the eval concludes (and any production-aggregation change is repopulated), add a migration creating `USING hnsw (store__track_preview_embedding vector_cosine_ops)` on `store__track_preview_embedding`
- [ ] 7.2 Confirm the cosine similarity query uses the index (EXPLAIN)
- [ ] 7.3 Optional cleanup: drop the eval table and remove the `variant:` token once conclusions are drawn
