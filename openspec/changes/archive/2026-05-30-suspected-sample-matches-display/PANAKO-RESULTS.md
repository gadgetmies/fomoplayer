# Panako fingerprinting — results report

_Generated 2026-05-30 21:22:40 on the local dev DB._

## Run parameters

- `SAMPLE_MATCH_DEFAULT_THRESHOLD`: `0.008` (Stage 1 distinct-hash overlap floor)
- `SAMPLE_MATCH_BUCKET_SECONDS`: `0.05` (Stage 2 Δt bucket width)
- `SAMPLE_MATCH_PEAK_BUCKET_MIN`: `1` (Stage 2 peak bucket floor)

## Extraction summary

- Samples fingerprinted: **0** / 0 (total hashes: 0)
- Previews fingerprinted: **2268** / 2268 (total hashes: 8961845)

## Ground truth vs Panako

Ground truth = the 10 `(sample, preview)` rows in `user_notification_audio_sample_match_gt`, a curator-maintained snapshot.

- **Recall** (of the 10 ground-truth pairs): 10/10 = **100%**
- **Precision** (vs total Panako-discovered matches above threshold): 10/35 = **29%**
- True positives: **10**
- False negatives (ground truth missed by Panako): **0**
- False positives / additional matches found: **25**

## Per-sample top-K matches

### Sample 1 — `94 - 6A - mantra_full.mp3`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 74 | 48 | 2275 | 2319 | 0.2393 | -94.700 | ✅ |
| 2 | 904 | 672 | 2 | 114 | 0.0118 | -135.900 |  |
| 3 | 3056 | 2306 | 2 | 94 | 0.0097 | -110.800 |  |

Ground truth: preview 74: rank 1

### Sample 2 — `153 - 6A - mantra_rec.mp3`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 74 | 48 | 3 | 33 | 0.0123 | -35.100 | ✅ |
| 2 | 904 | 672 | 2 | 27 | 0.0101 | 10.700 |  |

Ground truth: preview 74: rank 1

### Sample 3 — `serious_sound_rec.wav`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 135 | 88 | 11 | 64 | 0.1379 | 21.200 | ✅ |
| 2 | 163 | 111 | 8 | 71 | 0.1530 | 58.800 | ✅ |
| 3 | 919 | 682 | 2 | 5 | 0.0108 | -11.450 |  |
| 4 | 152 | 102 | 2 | 4 | 0.0086 | -9.800 |  |
| 5 | 2497 | 1921 | 1 | 6 | 0.0129 | -10.500 |  |
| 6 | 2463 | 1888 | 1 | 5 | 0.0108 | -14.400 |  |
| 7 | 1393 | 1042 | 1 | 5 | 0.0108 | 10.800 |  |
| 8 | 2413 | 1845 | 1 | 5 | 0.0108 | 7.550 |  |
| 9 | 1352 | 1003 | 1 | 4 | 0.0086 | 35.200 |  |
| 10 | 1682 | 1284 | 1 | 4 | 0.0086 | -3.650 |  |

Ground truth: preview 163: rank 2; preview 135: rank 1

### Sample 4 — `serious_sound_preview.mp3`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 163 | 111 | 2493 | 2203 | 1.0000 | 0.000 | ✅ |
| 2 | 135 | 88 | 200 | 390 | 0.1770 | 6.150 | ✅ |

Ground truth: preview 163: rank 1; preview 135: rank 2

### Sample 5 — `serious_sound_full.mp3`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 135 | 88 | 581 | 722 | 0.2119 | -91.000 | ✅ |
| 2 | 163 | 111 | 227 | 696 | 0.2042 | 13.200 | ✅ |
| 3 | 1745 | 1332 | 2 | 28 | 0.0082 | -97.550 |  |

Ground truth: preview 163: rank 2; preview 135: rank 1

### Sample 6 — `mantra_preview.mp3`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 74 | 48 | 6244 | 6185 | 1.0000 | 0.000 | ✅ |

Ground truth: preview 74: rank 1

### Sample 7 — `slices.mp3`

| Rank | Preview | Track | match_score | matching_hashes | stage1_ratio | peak Δt (s) | ground truth? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 55 | 46 | 8 | 25 | 0.0100 | -35.800 | ✅ |

Ground truth: preview 55: rank 1

## Additional Panako matches (not in ground truth)

Panako surfaced these pairs above threshold even though they were not hand-curated as positives. They could be true positives the curator missed, false positives from a noisy threshold, or self-matches.

| Sample | Filename | Preview | Track | score |
| --- | --- | --- | --- | --- |
| 1 | 94 - 6A - mantra_full.mp3 | 904 | 672 | 2 |
| 1 | 94 - 6A - mantra_full.mp3 | 3056 | 2306 | 2 |
| 2 | 153 - 6A - mantra_rec.mp3 | 904 | 672 | 2 |
| 3 | serious_sound_rec.wav | 152 | 102 | 2 |
| 3 | serious_sound_rec.wav | 293 | 224 | 1 |
| 3 | serious_sound_rec.wav | 464 | 374 | 1 |
| 3 | serious_sound_rec.wav | 909 | 675 | 1 |
| 3 | serious_sound_rec.wav | 919 | 682 | 2 |
| 3 | serious_sound_rec.wav | 1057 | 767 | 1 |
| 3 | serious_sound_rec.wav | 1111 | 820 | 1 |
| 3 | serious_sound_rec.wav | 1167 | 868 | 1 |
| 3 | serious_sound_rec.wav | 1292 | 956 | 1 |
| 3 | serious_sound_rec.wav | 1352 | 1003 | 1 |
| 3 | serious_sound_rec.wav | 1393 | 1042 | 1 |
| 3 | serious_sound_rec.wav | 1682 | 1284 | 1 |
| 3 | serious_sound_rec.wav | 1880 | 1438 | 1 |
| 3 | serious_sound_rec.wav | 2092 | 1598 | 1 |
| 3 | serious_sound_rec.wav | 2413 | 1845 | 1 |
| 3 | serious_sound_rec.wav | 2422 | 1853 | 1 |
| 3 | serious_sound_rec.wav | 2429 | 1860 | 1 |
| 3 | serious_sound_rec.wav | 2463 | 1888 | 1 |
| 3 | serious_sound_rec.wav | 2497 | 1921 | 1 |
| 3 | serious_sound_rec.wav | 2750 | 2107 | 1 |
| 3 | serious_sound_rec.wav | 3108 | 2337 | 1 |
| 5 | serious_sound_full.mp3 | 1745 | 1332 | 2 |
