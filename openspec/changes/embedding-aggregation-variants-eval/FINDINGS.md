# Evaluation findings (2026-05-31)

## Question

Does a different temporal aggregation of the Discogs-EffNet per-patch embeddings —
**trimmed_mean** (10%-per-tail) or **mean⊕std** (mean concatenated with per-dimension
std, 2560-d) — produce better track-similarity results than the production **mean**?

## Method

- Generated all three variants for **2870 / 2870 downloadable previews** (the other 218
  of 3088 are `missing`/have no URL), stored in a temporary `store__track_preview_embedding_variant`
  table.
- Per-track visual comparison of the temporal matrix vs each aggregation.
- Catalog-scale nearest-neighbour comparison: **20 query tracks**, top-10 cosine neighbours
  over the full 2870-preview catalog under each variant; measured how much the variants
  disagree.

## Results

Per-track, `mean` vs `trimmed_mean` cosine similarity was **0.994–0.999** across the sample.

Catalog-scale neighbour agreement (20 query tracks, top-10):

| Pair | Top-1 agreement | Jaccard@10 | Spearman (rank corr) |
|---|---|---|---|
| mean vs trimmed_mean | 95% | 0.89 | 0.999 |
| mean vs mean_std | 85% | 0.70 | 0.996 |
| trimmed_mean vs mean_std | 90% | 0.69 | 0.993 |

## Conclusions

1. **`trimmed_mean` is indistinguishable from `mean`.** ~89% of top-10 neighbours shared,
   #1 match agrees 95% of the time, ranking essentially identical (Spearman 0.999). For
   these ~30s / ~119-patch previews, 10% trimming doesn't move the vector. Not worth keeping.
2. **`mean_std` is the only variant that materially changes results** — ~30% of top-10
   neighbours differ and the nearest neighbour changes ~15% of the time — but it reshuffles
   *within the same broad neighbourhood* (Spearman 0.996) rather than producing different
   recommendations.
3. **"Different" is not "better."** There is no labelled "should-be-similar" ground truth,
   so the eval cannot say `mean_std`'s reshuffling is an improvement.

## Decision

- **Keep production aggregation = `mean`.** The variant scaffolding (eval table, `variant:`
  search token, analyser `--eval-variants` path, `POST /admin/embedding-variants`, and the
  Python eval scripts) was **reverted**.
- **Shipped from this work** (the genuine review fixes, independent of the variant question):
  - Similarity search ranks by **cosine distance** (`<=>`) instead of Euclidean (`<->`).
  - Similarity search **filters by embedding type**, so cross-model vectors aren't compared
    and the reference is deterministic.
  - Analyser preview branch records the **model actually used** (was sending `null` when
    `-m` was omitted); model is now built once per run.
- **Available if revisited:** the deferred HNSW cosine index (task 7.1), and — the only way
  to actually settle it — a small **labelled-pair eval scoring `mean` vs `mean_std`**
  (drop `trimmed_mean`).
