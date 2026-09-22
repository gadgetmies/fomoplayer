"""Pure-Python port of the production two-stage exact-match scorer.

Mirrors `packages/back/routes/admin/db.js:findExactMatchForSample`
(Stage 1: distinct-hash overlap above a threshold; Stage 2: peak
count of the `Δt = preview_t - sample_t` histogram bucketed at
`bucket_seconds`).

Both functions are pure — no I/O, no globals — so they can be
unit-tested on hand-built fingerprint dicts. Parity against the
production JS scorer is checked by the manual parity test in
`test_scorer.py`.
"""

from collections import Counter

# Panako 2.1 default: PANAKO_TRANSF_TIME_RESOLUTION / PANAKO_SAMPLE_RATE.
# Callers whose `t1` values are already in seconds should pass
# `seconds_per_block=1.0`.
DEFAULT_SECONDS_PER_BLOCK = 128.0 / 16000.0


def stage1_filter(sample_hashes, candidate_hashes_by_id, threshold):
    """Return candidate IDs whose distinct-hash overlap with the sample
    is at least `threshold`.

    `sample_hashes`: set of distinct hashes from the sample.
    `candidate_hashes_by_id`: dict of `candidate_id -> set(hashes)`.
    `threshold`: float in [0, 1]. Inclusive lower bound.

    Mirrors the Stage 1 SQL in `db.js`:
        COUNT(DISTINCT matching_hash)::FLOAT / sample_hash_count >= threshold
    """
    sample_count = len(sample_hashes)
    if sample_count == 0:
        return []
    passing = []
    for candidate_id, candidate_hashes in candidate_hashes_by_id.items():
        overlap = len(sample_hashes & candidate_hashes)
        ratio = overlap / sample_count
        if ratio >= threshold:
            passing.append(candidate_id)
    return passing


def stage2_score(
    sample_fingerprints,
    preview_fingerprints,
    bucket_seconds,
    seconds_per_block=DEFAULT_SECONDS_PER_BLOCK,
):
    """Return the peak Δt-bucket count for one (sample, preview) pair.

    `sample_fingerprints`: iterable of `(hash, t1)` tuples for the sample.
    `preview_fingerprints`: iterable of `(hash, t1)` tuples for the preview.
    `bucket_seconds`: histogram bucket width in seconds.
    `seconds_per_block`: scale factor applied to `t1` differences before
        bucketing. Set to `1.0` if `t1` values are already in seconds.

    Mirrors the Stage 2 SQL in `db.js`: for every (sample_fp, preview_fp)
    pair sharing a hash, compute `Δt = preview_t - sample_t` in seconds,
    bucket by `ROUND(Δt / bucket_seconds) * bucket_seconds`, return the
    count of the dominant bucket. Returns 0 when no hashes are shared.
    """
    if bucket_seconds <= 0:
        raise ValueError("bucket_seconds must be > 0")

    sample_by_hash = {}
    for h, t in sample_fingerprints:
        sample_by_hash.setdefault(h, []).append(t)

    bucket_counts = Counter()
    for h, preview_t in preview_fingerprints:
        sample_ts = sample_by_hash.get(h)
        if not sample_ts:
            continue
        for sample_t in sample_ts:
            delta_blocks = preview_t - sample_t
            delta_sec = delta_blocks * seconds_per_block
            # Match the SQL: ROUND(Δt / bucket_seconds) * bucket_seconds.
            # Banker's rounding in Python vs. SQL's ROUND can disagree at
            # exact half-bucket boundaries, but those are vanishingly rare
            # in practice. The parity test catches any drift that matters.
            bucket = round(delta_sec / bucket_seconds) * bucket_seconds
            bucket_counts[bucket] += 1

    if not bucket_counts:
        return 0
    return max(bucket_counts.values())
