# Panako fingerprinting — results report

_Generated 2026-05-30 17:12:57 on the local dev DB._

## Run parameters

- `SAMPLE_MATCH_DEFAULT_THRESHOLD`: `0.008` (Stage 1 distinct-hash overlap floor)
- `SAMPLE_MATCH_BUCKET_SECONDS`: `0.05` (Stage 2 Δt bucket width)
- `SAMPLE_MATCH_PEAK_BUCKET_MIN`: `1` (Stage 2 peak bucket floor)

## Extraction summary

- Samples fingerprinted: **0** / 0 (total hashes: 0)
- Previews fingerprinted: **191** / 191 (total hashes: 811232)

## Ground truth vs Panako

Ground truth = the 6 `(sample, preview)` rows that were hand-inserted into `user_notification_audio_sample_match` to seed the Settings UI (mantra samples 1,2,6 → preview 74 / track 48; serious samples 3,4,5 → preview 163 / track 111).

- **Recall** (of the 6 ground-truth pairs): 6/6 = **100%**
- **Precision** (vs total Panako-discovered matches above threshold): 6/12 = **50%**
- True positives: **6**
- False negatives (ground truth missed by Panako): **0**
- False positives / additional matches found: **6**

## Per-sample top-K matches

### Sample 1 — `94 - 6A - mantra_full.mp3`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 74 | 48 | 2275 | 2319 | 0.2393 | -94.700 | ✅ |

Ground truth: preview 74: rank 1

### Sample 2 — `153 - 6A - mantra_rec.mp3`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 74 | 48 | 3 | 33 | 0.0123 | -35.100 | ✅ |

Ground truth: preview 74: rank 1

### Sample 3 — `serious_sound_rec.wav`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 135 | 88 | 11 | 64 | 0.1379 | 21.200 |  |
| 2 | 163 | 111 | 8 | 71 | 0.1530 | 58.800 | ✅ |
| 3 | 152 | 102 | 2 | 4 | 0.0086 | -9.800 |  |
| 4 | 293 | 224 | 1 | 4 | 0.0086 | 29.800 |  |
| 5 | 464 | 374 | 1 | 4 | 0.0086 | 1.750 |  |

Ground truth: preview 163: rank 2

### Sample 4 — `serious_sound_preview.mp3`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 163 | 111 | 2493 | 2203 | 1.0000 | 0.000 | ✅ |
| 2 | 135 | 88 | 200 | 390 | 0.1770 | 6.150 |  |

Ground truth: preview 163: rank 1

### Sample 5 — `serious_sound_full.mp3`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 135 | 88 | 581 | 722 | 0.2119 | -91.000 |  |
| 2 | 163 | 111 | 227 | 696 | 0.2042 | 13.200 | ✅ |

Ground truth: preview 163: rank 2

### Sample 6 — `mantra_preview.mp3`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 74 | 48 | 6244 | 6185 | 1.0000 | 0.000 | ✅ |

Ground truth: preview 74: rank 1

## Additional Panako matches (not in ground truth)

Panako surfaced these pairs above threshold even though they were not hand-curated as positives. They could be true positives the curator missed, false positives from a noisy threshold, or self-matches.

| Sample | Filename | Preview | Track | score |
| --- | --- | --- | --- | --- |
| 3 | serious_sound_rec.wav | 135 | 88 | 11 |
| 3 | serious_sound_rec.wav | 152 | 102 | 2 |
| 3 | serious_sound_rec.wav | 293 | 224 | 1 |
| 3 | serious_sound_rec.wav | 464 | 374 | 1 |
| 4 | serious_sound_preview.mp3 | 135 | 88 | 200 |
| 5 | serious_sound_full.mp3 | 135 | 88 | 581 |
