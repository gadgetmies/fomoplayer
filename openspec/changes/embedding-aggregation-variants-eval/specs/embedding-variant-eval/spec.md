## ADDED Requirements

### Requirement: Correct model name on preview embeddings

The analyser preview-embedding ingestion SHALL record the embedding type matching the model actually used to compute the embedding, never a null or absent model when a default model was applied.

#### Scenario: Default model is recorded

- **WHEN** the analyser computes a preview embedding without an explicit `-m` argument (using the default model)
- **THEN** the POST to the backend records the model as the default model name (`discogs_multi_embeddings-effnet-bs64-1`)
- **AND** never records a null model

### Requirement: Temporal-aggregation variant methods

The analyser SHALL provide three temporal-aggregation methods over the model's per-patch embedding matrix: `mean`, `trimmed_mean` (per-dimension mean after discarding a fixed fraction from each tail), and `mean_std` (per-dimension mean concatenated with per-dimension standard deviation).

#### Scenario: Variant output dimensionality

- **WHEN** the analyser aggregates a `(n_patches, 1280)` temporal matrix
- **THEN** `mean` and `trimmed_mean` each produce a 1280-d vector
- **AND** `mean_std` produces a 2560-d vector

#### Scenario: Trimmed mean discards tails

- **WHEN** `trimmed_mean` aggregates the temporal matrix
- **THEN** for each dimension a fixed fraction (default 10%) of the highest and lowest patch values is discarded before averaging

### Requirement: Variant embedding storage

A temporary table SHALL store variant embeddings keyed by preview and variant name, using a dimensionless vector column so both 1280-d and 2560-d variants are storable, and following the repository's column-naming conventions.

#### Scenario: Variants of differing dimensionality coexist

- **WHEN** `mean` (1280-d) and `mean_std` (2560-d) variants are stored for the same preview
- **THEN** both rows persist in `store__track_preview_embedding_variant` distinguished by `store__track_preview_embedding_variant_name`
- **AND** re-storing a variant for the same preview and name updates the existing row

### Requirement: Variant generation flag

The analyser SHALL provide an `--eval-variants` flag that, for the processed preview batch, computes all variants, sends them to a backend ingestion endpoint, and triggers visualization generation. Normal (non-eval) runs SHALL be unaffected.

#### Scenario: Eval run stores all variants

- **WHEN** the analyser runs with `--eval-variants` over a preview batch
- **THEN** each processed preview has `mean`, `trimmed_mean`, and `mean_std` rows submitted to the variant ingestion endpoint

#### Scenario: Normal run is unchanged

- **WHEN** the analyser runs without `--eval-variants`
- **THEN** no variant rows are produced and the existing single-embedding ingestion behavior is unchanged

### Requirement: Per-track aggregation visualization

Under the eval flag, the analyser SHALL produce one image per processed preview that places the raw temporal embedding matrix next to each aggregated variant, sharing a common colormap and dimension axis so the strips align row-for-row with the temporal heatmap.

#### Scenario: Visualization contents and layout

- **WHEN** a preview is processed with `--eval-variants`
- **THEN** an image is written to `analyser/eval/embedding_viz/<preview_id>.png`
- **AND** it contains the temporal heatmap (embedding dimensions on one axis, patches/time on the other) and a strip per variant rendered at a fixed narrow width (~50px) aligned to the heatmap's dimension axis
