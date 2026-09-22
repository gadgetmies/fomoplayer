#!/usr/bin/env python3
"""Local CLI for sample-matching diagnostics.

Runs Panako fingerprint extraction on one or more pairs of audio files
and reports per-file hash counts, per-pair intersection / Jaccard /
containment, and a histogram of Δt = position_right - position_left
over matched hashes. Exits non-zero when a positive pair fails to
produce a dominant peak bucket.

Reuses `panako_processor.extract_panako_fingerprints` so this CLI and
the production pipeline share the same extractor: any extraction-side
regression visible here is the same one production sees.

Examples:

    # Default: run the four built-in fixture pairs in analyser/data/
    python debug_match.py

    # Compare two arbitrary files
    python debug_match.py --pair foo.mp3 bar.wav

    # Machine-readable output (one JSON object per pair on stdout)
    python debug_match.py --json
"""

import argparse
import json
import os
import statistics
import sys
from collections import Counter

from panako_processor import extract_panako_fingerprints


# The fixtures shipped in analyser/data/. Each tuple is a positive
# pair (left should match right); see debug-sample-matching proposal
# for the rationale of these specific pairs.
DEFAULT_PAIRS = [
    ("mantra_rec.mp3", "mantra_preview.mp3"),
    ("serious_sound_rec.wav", "serious_sound_preview.mp3"),
    ("serious_sound_rec.wav", "serious_sound_full.mp3"),
    ("serious_sound_full.mp3", "serious_sound_preview.mp3"),
]


def file_stats(fingerprints):
    return {
        "totalFingerprints": len(fingerprints),
        "distinctHashes": len({fp["hash"] for fp in fingerprints}),
        "distinctHashWithF1": len({(fp["hash"], fp["f1"]) for fp in fingerprints}),
    }


def intersection_stats(left, right):
    left_hashes = {fp["hash"] for fp in left}
    right_hashes = {fp["hash"] for fp in right}
    hash_only = left_hashes & right_hashes

    left_hf = {(fp["hash"], fp["f1"]) for fp in left}
    right_hf = {(fp["hash"], fp["f1"]) for fp in right}
    hash_with_f1 = left_hf & right_hf

    union = left_hashes | right_hashes
    smaller = min(len(left_hashes), len(right_hashes)) or 1

    return {
        "intersectionHashOnly": len(hash_only),
        "intersectionHashWithF1": len(hash_with_f1),
        "jaccard": len(hash_only) / len(union) if union else 0.0,
        "containmentAgainstSmaller": len(hash_only) / smaller,
    }


def offset_histogram(left, right, bucket_seconds):
    # For each hash present on both sides, generate Δt = position_right −
    # position_left for every (left_pos, right_pos) pair. Cartesian product
    # is acceptable here because Panako hashes are sparse per file
    # (typically one position per hash); this is a local debug tool, not
    # a hot path.
    left_by_hash = {}
    for fp in left:
        left_by_hash.setdefault(fp["hash"], []).append(fp["position"])
    right_by_hash = {}
    for fp in right:
        right_by_hash.setdefault(fp["hash"], []).append(fp["position"])

    buckets = Counter()
    for h, left_positions in left_by_hash.items():
        right_positions = right_by_hash.get(h)
        if not right_positions:
            continue
        for lp in left_positions:
            for rp in right_positions:
                delta = rp - lp
                # Round-then-multiply gives sensible bucket centres; the
                # outer round trims floating-point noise from the label so
                # JSON output is stable across runs.
                bucket = round(round(delta / bucket_seconds) * bucket_seconds, 6)
                buckets[bucket] += 1

    return buckets


def format_pair_report(left_name, right_name, left_fps, right_fps,
                       bucket_seconds, peak_multiplier):
    left_stat = file_stats(left_fps)
    right_stat = file_stats(right_fps)
    inter = intersection_stats(left_fps, right_fps)
    hist = offset_histogram(left_fps, right_fps, bucket_seconds)
    top = hist.most_common(10)
    counts_desc = sorted(hist.values(), reverse=True)
    peak = counts_desc[0] if counts_desc else 0
    # "Noise floor" is the median over every bucket EXCEPT the peak. Using
    # the full median makes a textbook clean match (one bucket, all matches
    # in it) fail because peak == median by construction. Excluding the peak
    # bucket gives the heuristic the noise-floor reading it's actually
    # asking for.
    others = counts_desc[1:]
    noise_floor = statistics.median(others) if others else 0
    # A real match has peak >> noise_floor; noise has peak ≈ noise_floor.
    # The multiplier is a heuristic so the CLI can exit non-zero without
    # the operator reading the histogram by eye.
    if noise_floor > 0:
        passed = peak >= peak_multiplier * noise_floor
    else:
        passed = peak > 0
    median = statistics.median(counts_desc) if counts_desc else 0

    return {
        "pair": [left_name, right_name],
        "files": {left_name: left_stat, right_name: right_stat},
        "intersection": inter,
        "topOffsetBuckets": [
            {"deltaTSeconds": delta, "count": count} for delta, count in top
        ],
        "peakBucket": peak,
        "medianBucket": median,
        "passed": passed,
    }


def print_text_report(report):
    left, right = report["pair"]
    print(f"\n=== {left}  ↔  {right} ===")
    for fname, stat in report["files"].items():
        print(
            f"  {fname}: total={stat['totalFingerprints']}, "
            f"distinctHash={stat['distinctHashes']}, "
            f"distinct(h,f1)={stat['distinctHashWithF1']}"
        )
    inter = report["intersection"]
    print(
        f"  intersection: hash={inter['intersectionHashOnly']}, "
        f"(h,f1)={inter['intersectionHashWithF1']}, "
        f"jaccard={inter['jaccard']:.4f}, "
        f"containment={inter['containmentAgainstSmaller']:.4f}"
    )
    print(f"  top offset buckets (showing {len(report['topOffsetBuckets'])}):")
    for entry in report["topOffsetBuckets"]:
        print(f"    Δt={entry['deltaTSeconds']:+.3f}s  count={entry['count']}")
    verdict = "PASS" if report["passed"] else "FAIL"
    print(
        f"  peak={report['peakBucket']}, "
        f"median={report['medianBucket']:.2f}, "
        f"verdict={verdict}"
    )


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--pair", nargs=2, action="append", metavar=("FILE_A", "FILE_B"),
        help="Compare two audio files. Repeatable. If omitted, runs the "
             "four built-in fixture pairs from --data-dir.",
    )
    parser.add_argument(
        "--data-dir",
        default=os.path.join(os.path.dirname(__file__), "data"),
        help="Directory holding fixture audio files (default: analyser/data)",
    )
    parser.add_argument(
        "--bucket-seconds", type=float, default=0.05,
        help="Bucket size for Δt histogram (default: 0.05)",
    )
    parser.add_argument(
        "--peak-multiplier", type=float, default=3.0,
        help="Peak/median ratio required to count a positive pair as "
             "passing (default: 3.0)",
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Emit one JSON object per pair on stdout (text report is "
             "still emitted on stderr when verbose human-readable output "
             "is desired alongside).",
    )
    args = parser.parse_args()

    if args.pair:
        pairs = [
            (os.path.basename(a), a, os.path.basename(b), b)
            for a, b in args.pair
        ]
    else:
        pairs = [
            (a, os.path.join(args.data_dir, a),
             b, os.path.join(args.data_dir, b))
            for a, b in DEFAULT_PAIRS
        ]

    # Cache by absolute path so overlapping pairs (e.g. the three pairs
    # built on serious_sound_*) don't re-run Panako on the same file.
    cache = {}

    def extract(path):
        abspath = os.path.abspath(path)
        if abspath not in cache:
            print(f"Extracting {abspath}", file=sys.stderr)
            cache[abspath] = extract_panako_fingerprints(abspath)
        return cache[abspath]

    reports = []
    failed_pairs = []
    for left_name, left_path, right_name, right_path in pairs:
        try:
            left_fps = extract(left_path)
            right_fps = extract(right_path)
            report = format_pair_report(
                left_name, right_name, left_fps, right_fps,
                args.bucket_seconds, args.peak_multiplier,
            )
            reports.append(report)
            if not report["passed"]:
                failed_pairs.append((
                    left_name, right_name,
                    report["peakBucket"], report["medianBucket"],
                ))
            if not args.json:
                print_text_report(report)
        except Exception as e:
            print(
                f"ERROR processing {left_name} ↔ {right_name}: {e}",
                file=sys.stderr,
            )
            failed_pairs.append((left_name, right_name, 0, 0))

    if args.json:
        for r in reports:
            print(json.dumps(r))

    if failed_pairs:
        print("\nFAILED pairs (peak below "
              f"{args.peak_multiplier}× median):", file=sys.stderr)
        for left, right, peak, median in failed_pairs:
            print(
                f"  {left} ↔ {right}: peak={peak}, median={median}",
                file=sys.stderr,
            )
        sys.exit(1)


if __name__ == "__main__":
    main()
