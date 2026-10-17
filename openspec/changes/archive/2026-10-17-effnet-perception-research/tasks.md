## 1. Setup

- [x] 1.1 Create `analyser/research/effnet-perception/` with the `epr` package, `python -m epr` CLI, `requirements.txt`, README and a venv recipe
- [x] 1.2 Read-only catalog access (`mode=ro` URI), output-directory guard, per-step `results`/`failures.csv`/`summary.json` and done-markers
- [x] 1.3 Decoding to 16 kHz mono `(L+R)/2` with essentia's MonoLoader settings (as the analyser), and per-patch EffNet embedding with the analyser `.pb`
- [x] 1.4 Seeded, stratified sampler (crate + genre; excludes missing, < 60 s; grid-only option) with a snapshot of sampled rows
- [x] 1.5 Tests: read-only guard, sampler determinism, embedding shape

## 2. Part 1: representations

- [x] 2.1 Full-track per-patch embeddings for the Part 1 sample (500)
- [x] 2.2 Pooled representations: mean, median, mean ⊕ std, centred, PCA-whitened, k-means multi-vector
- [x] 2.3 Section representations: 30/60 s at fixed position, most typical window, loudest window; phrase-aligned 16/32-bar sections on the beat grid
- [x] 2.4 Stem embeddings (htdemucs) with weighted combination; style probabilities when the model is present
- [x] 2.5 Comparison: top-10 overlap, rank correlation, attributes of changed neighbours, largest disagreements
- [x] 2.6 Unit selection for Part 2, recorded in the summary

## 3. Part 2: audio changes

- [x] 3.1 Change generators with verifiers (tempo, pitch, varispeed, codecs, filters, EQ, compression, mono/width, resample, noise, reverb, bar shuffle, reverse, stem removal/solo)
- [x] 3.2 Tests for verifiers: pitch, duration ratio, filter band energy, codec bitrate
- [x] 3.3 Run changes on the Part 2 sample (300) and record distance, normalised shift and self-retrieval
- [x] 3.4 Stem-swap renderer (bar cut, sox stretch, level match) with provenance note, and tests
- [x] 3.5 Run swaps (200 pairs × 3 layers) and record host/donor positions
- [x] 3.6 Stem offsets: unshifted recombination (separation loss) and 1/16, beat, bar, off-grid shifts per layer (50 tracks), with an offset-on-grid test

## 4. Part 3: what explains closeness

- [x] 4.1 Decode AKIN stored means; parity check against recomputed means
- [x] 4.2 Pairwise distance vs BPM difference, Camelot distance, shared genre/label/artist, energy difference
- [x] 4.3 Cross-validated linear probes for BPM, key and genre with chance baselines
- [x] 4.4 Literature review notes

## 5. Deliverables

- [x] 5.1 Charts and `FINDINGS.md` with the "what the model listens to" summary
- [x] 5.2 Local listening page on `/Volumes/DJ/research/effnet-perception/page/`
- [x] 5.3 Commit the tooling and findings (no personal audio or track lists), push the branch
