"""Sample-matching evaluation harness.

Given the curated pairs in `sample_match_eval_pair`, this script:

1. Pulls each sample's expected previews and a deterministic set of
   distractor previews from `store__track_preview`.
2. Extracts panako fingerprints for every unique audio file (sample
   or preview) exactly once — optionally cached via `--cache-extractions`.
3. Sweeps the `(threshold, bucket_seconds)` grid, scoring each
   `(sample, candidate)` pair with the pure-Python scorer.
4. Emits a per-pair CSV and a console summary with top-1 / top-5 /
   recall / FPR per grid cell.

All DB access goes through `fomoplayer query`. The script exits non-zero
when prerequisite state (the table, auth, …) is missing.

See `analyser/eval/README.md` for the operator-facing runbook.
"""

import argparse
import csv
import json
import os
import random
import subprocess
import sys
from collections import defaultdict


# Default grid. Documented in design.md / README.md. Centred on the
# production SAMPLE_MATCH_DEFAULT_THRESHOLD (0.008).
DEFAULT_THRESHOLDS = (0.005, 0.008, 0.01, 0.02, 0.05)
DEFAULT_BUCKET_SECONDS = (0.05, 0.1)
DEFAULT_DISTRACTORS = 20
DEFAULT_SEED = 42
DISTRACTOR_POOL_SIZE = 10_000


# Sentinel exit codes — matched by the spec's error-path scenarios.
EXIT_OK = 0
EXIT_MISSING_TABLE = 2
EXIT_QUERY_FAILED = 3


# ----------------------------------------------------------------------
# Subprocess wrapper around `fomoplayer query`
# ----------------------------------------------------------------------


class FomoplayerQueryError(RuntimeError):
    """Raised when `fomoplayer query` exits non-zero."""


def fomoplayer_query(sql, fomoplayer_bin="fomoplayer"):
    """Run `fomoplayer query <SQL>` and parse stdout as JSON.

    Raises FomoplayerQueryError on non-zero exit, surfacing the
    full stderr verbatim so operator-visible auth / connectivity errors
    aren't swallowed.
    """
    try:
        result = subprocess.run(
            [fomoplayer_bin, "query", sql],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as e:
        raise FomoplayerQueryError(
            f"`{fomoplayer_bin}` is not on PATH. Install the fomoplayer CLI "
            f"from packages/cli and run `fomoplayer login` first."
        ) from e

    if result.returncode != 0:
        raise FomoplayerQueryError(
            f"fomoplayer query failed (exit {result.returncode}):\n"
            f"  SQL: {sql}\n"
            f"  stderr: {result.stderr.rstrip()}\n"
            f"  stdout: {result.stdout.rstrip()}"
        )

    stdout = result.stdout.strip()
    if not stdout:
        return []
    return json.loads(stdout)


def fomoplayer_api_url(fomoplayer_bin="fomoplayer"):
    """Return the API URL the fomoplayer CLI is currently pointed at.

    Used at startup so the operator can confirm the target environment
    before committing to a long extraction run. Returns None if the CLI
    doesn't expose the value (older versions); the caller logs a warning
    instead of failing.
    """
    for args in (("config", "get", "apiUrl"), ("config", "show")):
        try:
            result = subprocess.run(
                [fomoplayer_bin, *args],
                capture_output=True,
                text=True,
                check=False,
                timeout=5,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return None
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    return None


# ----------------------------------------------------------------------
# Queries (per spec)
# ----------------------------------------------------------------------


SQL_PAIRS = (
    "SELECT "
    "  sme.user_notification_audio_sample_id AS sample_id, "
    "  sme.store__track_preview_id AS preview_id "
    "FROM sample_match_eval_pair sme "
    "ORDER BY sme.user_notification_audio_sample_id, sme.store__track_preview_id"
)

SQL_DISTRACTOR_POOL = (
    "SELECT store__track_preview_id AS preview_id "
    "FROM store__track_preview "
    "WHERE store__track_preview_url IS NOT NULL "
    "ORDER BY store__track_preview_id "
    f"LIMIT {DISTRACTOR_POOL_SIZE}"
)


def sql_sample_urls(sample_ids):
    if not sample_ids:
        return None
    ids = ",".join(str(int(s)) for s in sample_ids)
    return (
        "SELECT "
        "  user_notification_audio_sample_id AS id, "
        "  user_notification_audio_sample_url AS url "
        "FROM user_notification_audio_sample "
        f"WHERE user_notification_audio_sample_id IN ({ids})"
    )


def sql_preview_urls(preview_ids):
    if not preview_ids:
        return None
    ids = ",".join(str(int(p)) for p in preview_ids)
    return (
        "SELECT "
        "  store__track_preview_id AS id, "
        "  store__track_preview_url AS url "
        "FROM store__track_preview "
        f"WHERE store__track_preview_id IN ({ids})"
    )


def fetch_pairs(fomoplayer_bin):
    """Return {sample_id: set(expected_preview_ids)}.

    Empty dict if the table is empty; raises if it doesn't exist.
    """
    try:
        rows = fomoplayer_query(SQL_PAIRS, fomoplayer_bin=fomoplayer_bin)
    except FomoplayerQueryError as e:
        # Heuristic: the table-missing error contains the table name in
        # the Postgres "relation ... does not exist" message.
        if "sample_match_eval_pair" in str(e) and "does not exist" in str(e):
            raise SystemExit(
                f"sample_match_eval_pair does not exist. Apply the migration:\n"
                f"  packages/back/migrations/sqls/"
                f"20260528150000-add-sample-match-eval-pair-up.sql\n"
                f"underlying error: {e}"
            )
        raise

    result = defaultdict(set)
    for row in rows:
        result[int(row["sample_id"])].add(int(row["preview_id"]))
    return dict(result)


def fetch_distractor_pool(fomoplayer_bin):
    rows = fomoplayer_query(SQL_DISTRACTOR_POOL, fomoplayer_bin=fomoplayer_bin)
    return [int(row["preview_id"]) for row in rows]


def fetch_sample_urls(sample_ids, fomoplayer_bin):
    sql = sql_sample_urls(sample_ids)
    if sql is None:
        return {}
    rows = fomoplayer_query(sql, fomoplayer_bin=fomoplayer_bin)
    return {int(row["id"]): row["url"] for row in rows}


def fetch_preview_urls(preview_ids, fomoplayer_bin):
    sql = sql_preview_urls(preview_ids)
    if sql is None:
        return {}
    rows = fomoplayer_query(sql, fomoplayer_bin=fomoplayer_bin)
    return {int(row["id"]): row["url"] for row in rows}


# ----------------------------------------------------------------------
# Distractor selection
# ----------------------------------------------------------------------


def pick_distractors(pool, expected, count, seed, sample_id):
    """Deterministically pick `count` distractor preview IDs.

    Per Decision 6 of design.md: per-sample selection from
    `pool minus expected`, seeded by `(seed, sample_id)` so the same
    seed + same prod catalog produce the same distractors for the same
    sample.
    """
    available = [p for p in pool if p not in expected]
    # Random() doesn't accept tuples; encode the (seed, sample_id) pair
    # as a string seed instead. random.Random's str-seed handling is
    # deterministic across CPython invocations (independent of
    # PYTHONHASHSEED).
    rng = random.Random(f"{seed}:{sample_id}")
    if count >= len(available):
        return list(available)
    return rng.sample(available, count)


# ----------------------------------------------------------------------
# Extraction phase
# ----------------------------------------------------------------------


def extract_all(urls_by_id, kind, cache_dir, extract_fn, log_fn):
    """Extract fingerprints for every (id, url) once.

    Returns `{id: list[(hash, t1_sec)]}`. Failed extractions map to None
    so the scorer phase can mark `extraction_failed=true` and skip.
    """
    fingerprints = {}
    total = len(urls_by_id)
    for index, (id_, url) in enumerate(sorted(urls_by_id.items()), start=1):
        log_fn(f"[extract] {kind} {index}/{total} id={id_} url={url}")
        try:
            fps = extract_fn(url, cache_dir=cache_dir)
        except Exception as e:
            log_fn(f"[extract] FAILED {kind} id={id_} url={url}: {e}")
            fingerprints[id_] = None
            continue
        fingerprints[id_] = fps
    return fingerprints


# ----------------------------------------------------------------------
# Scoring + CSV + summary
# ----------------------------------------------------------------------


# Mirror the bounds in db.js so the eval ranks the same candidate set
# production would: Stage 1 hands at most 100 candidates to Stage 2, and the
# final select returns at most 10 matches.
STAGE1_CANDIDATE_LIMIT = 100
FINAL_MATCH_LIMIT = 10

CSV_COLUMNS = [
    "sample_id",
    "candidate_id",
    "is_expected",
    "threshold",
    "bucket_seconds",
    "stage1_passed",
    "stage2_score",
    "rank_among_candidates",
    "extraction_failed",
]


def sweep(
    pairs_by_sample,
    distractors_by_sample,
    sample_fps,
    preview_fps,
    thresholds,
    bucket_seconds_grid,
    out_csv_path,
    scorer,
    log_fn,
):
    """Run the sweep, write the CSV, and return the per-cell summary rows.

    `scorer` is a module exposing `stage1_filter` and `stage2_score`
    (passed in so tests can substitute a fake).
    """
    summaries = []

    with open(out_csv_path, "w", newline="") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=CSV_COLUMNS)
        writer.writeheader()

        for threshold in thresholds:
            for bucket_seconds in bucket_seconds_grid:
                cell_top1 = 0
                cell_top5 = 0
                cell_total_samples = 0
                cell_expected_pairs_seen = 0
                cell_expected_pairs_recalled = 0
                cell_fp_samples = 0
                cell_fp_scored = 0
                cell_fp_excluded = 0

                for sample_id in sorted(pairs_by_sample):
                    expected_set = pairs_by_sample[sample_id]
                    distractor_ids = distractors_by_sample.get(sample_id, [])
                    candidate_ids = list(expected_set) + list(distractor_ids)

                    sample_fp = sample_fps.get(sample_id)
                    if sample_fp is None:
                        # The sample itself failed to extract — write
                        # one row per candidate with extraction_failed
                        # and skip scoring.
                        for cand_id in candidate_ids:
                            writer.writerow({
                                "sample_id": sample_id,
                                "candidate_id": cand_id,
                                "is_expected": int(cand_id in expected_set),
                                "threshold": threshold,
                                "bucket_seconds": bucket_seconds,
                                "stage1_passed": "",
                                "stage2_score": "",
                                "rank_among_candidates": "",
                                "extraction_failed": "true",
                            })
                        continue

                    sample_hash_set = {h for h, _ in sample_fp}

                    cand_hashes_by_id = {}
                    cand_failed = set()
                    for cand_id in candidate_ids:
                        cand_fp = preview_fps.get(cand_id)
                        if cand_fp is None:
                            cand_failed.add(cand_id)
                            continue
                        cand_hashes_by_id[cand_id] = {h for h, _ in cand_fp}

                    stage1_pass = set(
                        scorer.stage1_filter(
                            sample_hash_set,
                            cand_hashes_by_id,
                            threshold,
                        )
                    )

                    # Distinct-hash overlap per candidate. This is the SQL's
                    # `matching_hashes`, which orders Stage 1 and breaks ties
                    # in the final ranking.
                    matching_hashes = {
                        cand_id: len(sample_hash_set & cand_hashes)
                        for cand_id, cand_hashes in cand_hashes_by_id.items()
                    }

                    # Score every candidate (even those that failed
                    # Stage 1) so the CSV records the picture an
                    # operator can audit later.
                    cand_scores = {}
                    for cand_id, cand_hashes in cand_hashes_by_id.items():
                        cand_fp = preview_fps[cand_id]
                        cand_scores[cand_id] = scorer.stage2_score(
                            sample_fp,
                            cand_fp,
                            bucket_seconds=bucket_seconds,
                            seconds_per_block=1.0,
                        )

                    # Ranking mirrors production, which is a *pipeline*: Stage 1
                    # filters, Stage 2 only ever sees what survived. Ranking the
                    # full candidate set here (as an earlier version did) made
                    # top1/top5/fpr independent of `threshold`, so every row of
                    # the sweep came out identical and the grid said nothing.
                    #
                    # db.js: Stage 1 is `ORDER BY matching_hashes DESC LIMIT 100`,
                    # the final select `ORDER BY match_score DESC,
                    # c.matching_hashes DESC LIMIT 10`. `candidate_id` is appended
                    # only to keep the sort deterministic under equal keys.
                    stage1_ranked = sorted(
                        stage1_pass,
                        key=lambda cid: (-matching_hashes[cid], cid),
                    )[:STAGE1_CANDIDATE_LIMIT]
                    ranked = sorted(
                        ((cid, cand_scores[cid]) for cid in stage1_ranked),
                        key=lambda kv: (-kv[1], -matching_hashes[kv[0]], kv[0]),
                    )[:FINAL_MATCH_LIMIT]
                    rank_by_id = {cid: rank for rank, (cid, _) in enumerate(ranked, start=1)}

                    cell_total_samples += 1
                    cell_expected_pairs_seen += len(expected_set)
                    for exp_id in expected_set:
                        if (
                            exp_id in stage1_pass
                            and cand_scores.get(exp_id, 0) > 0
                        ):
                            cell_expected_pairs_recalled += 1

                    top_id = ranked[0][0] if ranked else None
                    top5_ids = {cid for cid, _ in ranked[:5]}

                    if top_id in expected_set:
                        cell_top1 += 1
                    if expected_set & top5_ids:
                        cell_top5 += 1

                    # False positive: any distractor ranks above all
                    # expected previews.
                    #
                    # A sample whose expected preview could not be extracted is
                    # excluded from the FPR denominator rather than charged as a
                    # false positive: the pipeline never had the chance to rank
                    # it, so counting it would measure extraction health, not
                    # matcher precision. Those samples are reported separately
                    # as `fp_excluded_extraction_failed`.
                    expected_extractable = {
                        exp for exp in expected_set if exp not in cand_failed
                    }
                    if not expected_extractable:
                        cell_fp_excluded += 1
                    else:
                        best_expected_rank = min(
                            (rank_by_id[exp] for exp in expected_extractable if exp in rank_by_id),
                            default=None,
                        )
                        best_distractor_rank = min(
                            (rank_by_id[d] for d in distractor_ids if d in rank_by_id),
                            default=None,
                        )
                        cell_fp_scored += 1
                        if (
                            best_distractor_rank is not None
                            and (
                                best_expected_rank is None
                                or best_distractor_rank < best_expected_rank
                            )
                        ):
                            cell_fp_samples += 1

                    for cand_id in candidate_ids:
                        if cand_id in cand_failed:
                            writer.writerow({
                                "sample_id": sample_id,
                                "candidate_id": cand_id,
                                "is_expected": int(cand_id in expected_set),
                                "threshold": threshold,
                                "bucket_seconds": bucket_seconds,
                                "stage1_passed": "",
                                "stage2_score": "",
                                "rank_among_candidates": "",
                                "extraction_failed": "true",
                            })
                            continue
                        writer.writerow({
                            "sample_id": sample_id,
                            "candidate_id": cand_id,
                            "is_expected": int(cand_id in expected_set),
                            "threshold": threshold,
                            "bucket_seconds": bucket_seconds,
                            "stage1_passed": int(cand_id in stage1_pass),
                            "stage2_score": cand_scores[cand_id],
                            # Blank for candidates Stage 1 dropped, or pushed
                            # past the LIMITs: production never ranks those.
                            "rank_among_candidates": rank_by_id.get(cand_id, ""),
                            "extraction_failed": "false",
                        })

                top1_acc = (cell_top1 / cell_total_samples) if cell_total_samples else 0.0
                top5_acc = (cell_top5 / cell_total_samples) if cell_total_samples else 0.0
                recall = (
                    cell_expected_pairs_recalled / cell_expected_pairs_seen
                    if cell_expected_pairs_seen
                    else 0.0
                )
                # Denominator is the samples the matcher actually got to rank,
                # not every sample in the set.
                fpr = (cell_fp_samples / cell_fp_scored) if cell_fp_scored else 0.0
                summaries.append({
                    "threshold": threshold,
                    "bucket_seconds": bucket_seconds,
                    "top1": top1_acc,
                    "top5": top5_acc,
                    "recall": recall,
                    "fpr": fpr,
                    "fp_scored_samples": cell_fp_scored,
                    "fp_excluded_extraction_failed": cell_fp_excluded,
                    "samples": cell_total_samples,
                })

    return summaries


def print_summary(summaries, out_stream=sys.stdout):
    header = (
        f"{'threshold':>10s} {'bucket_s':>10s} "
        f"{'top1':>7s} {'top5':>7s} {'recall':>7s} {'fpr':>7s} {'N':>5s}"
    )
    out_stream.write(header + "\n")
    out_stream.write("-" * len(header) + "\n")
    for s in summaries:
        out_stream.write(
            f"{s['threshold']:>10.4f} {s['bucket_seconds']:>10.4f} "
            f"{s['top1']:>7.2%} {s['top5']:>7.2%} {s['recall']:>7.2%} {s['fpr']:>7.2%} "
            f"{s['samples']:>5d}\n"
        )


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------


def parse_comma_floats(raw):
    return tuple(float(x) for x in raw.split(",") if x.strip())


def build_parser():
    parser = argparse.ArgumentParser(
        description="Sample-matching evaluation sweep.",
    )
    parser.add_argument(
        "--thresholds",
        type=parse_comma_floats,
        default=DEFAULT_THRESHOLDS,
        help="Comma-separated Stage 1 thresholds (default: %(default)s).",
    )
    parser.add_argument(
        "--bucket-seconds",
        type=parse_comma_floats,
        default=DEFAULT_BUCKET_SECONDS,
        help="Comma-separated Stage 2 bucket sizes in seconds (default: %(default)s).",
    )
    parser.add_argument(
        "--distractors",
        type=int,
        default=DEFAULT_DISTRACTORS,
        help="Distractor previews per sample (default: %(default)d).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_SEED,
        help="RNG seed for distractor selection (default: %(default)d).",
    )
    parser.add_argument(
        "--cache-extractions",
        action="store_true",
        help="Cache panako fingerprints under ./.cache so re-runs are fast.",
    )
    parser.add_argument(
        "--out",
        required=True,
        help="Output CSV path.",
    )
    parser.add_argument(
        "--fomoplayer",
        default="fomoplayer",
        help="Path/name of the fomoplayer CLI (default: %(default)s).",
    )
    parser.add_argument(
        "--cache-dir",
        default=None,
        help="Override cache directory (defaults to analyser/eval/.cache).",
    )
    return parser


def _resolve_cache_dir(explicit, enabled):
    if not enabled:
        return None
    if explicit:
        return explicit
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache")


def _load_eval_modules():
    """Return `(scorer_module, extract_fn)` working from either invocation."""
    try:
        from analyser.eval import scorer as _scorer
        from analyser.eval.extraction import extract as _extract
    except ImportError:  # pragma: no cover - import-path shim
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from eval import scorer as _scorer  # type: ignore[no-redef]
        from eval.extraction import extract as _extract  # type: ignore[no-redef]
    return _scorer, _extract


def main(argv=None):
    args = build_parser().parse_args(argv)

    def log(msg):
        print(msg, flush=True)

    api_url = fomoplayer_api_url(args.fomoplayer)
    if api_url:
        log(f"[startup] fomoplayer API URL: {api_url}")
    else:
        log(
            "[startup] WARNING: could not resolve fomoplayer API URL — "
            "confirm `fomoplayer login` points at the intended environment."
        )

    try:
        pairs_by_sample = fetch_pairs(args.fomoplayer)
    except FomoplayerQueryError as e:
        log(f"ERROR: {e}")
        return EXIT_QUERY_FAILED

    if not pairs_by_sample:
        log(
            "no pairs to evaluate; insert rows into sample_match_eval_pair "
            "(see analyser/eval/README.md)."
        )
        return EXIT_OK

    try:
        distractor_pool = fetch_distractor_pool(args.fomoplayer)
    except FomoplayerQueryError as e:
        log(f"ERROR: {e}")
        return EXIT_QUERY_FAILED

    log(
        f"[plan] {len(pairs_by_sample)} sample(s), "
        f"{sum(len(v) for v in pairs_by_sample.values())} expected pair(s), "
        f"distractor pool: {len(distractor_pool)}"
    )

    distractors_by_sample = {
        sample_id: pick_distractors(
            distractor_pool,
            expected,
            args.distractors,
            args.seed,
            sample_id,
        )
        for sample_id, expected in pairs_by_sample.items()
    }

    needed_sample_ids = set(pairs_by_sample)
    needed_preview_ids = set()
    for sample_id, expected in pairs_by_sample.items():
        needed_preview_ids.update(expected)
        needed_preview_ids.update(distractors_by_sample[sample_id])

    try:
        sample_urls = fetch_sample_urls(needed_sample_ids, args.fomoplayer)
        preview_urls = fetch_preview_urls(needed_preview_ids, args.fomoplayer)
    except FomoplayerQueryError as e:
        log(f"ERROR: {e}")
        return EXIT_QUERY_FAILED

    cache_dir = _resolve_cache_dir(args.cache_dir, args.cache_extractions)
    if cache_dir:
        log(f"[cache] enabled at {cache_dir}")
    else:
        log("[cache] disabled — extraction will run end-to-end")

    scorer, extract_fn = _load_eval_modules()

    sample_fps = extract_all(sample_urls, "sample", cache_dir, extract_fn, log)
    preview_fps = extract_all(preview_urls, "preview", cache_dir, extract_fn, log)

    summaries = sweep(
        pairs_by_sample,
        distractors_by_sample,
        sample_fps,
        preview_fps,
        args.thresholds,
        args.bucket_seconds,
        args.out,
        scorer,
        log,
    )

    log("")
    log(f"[done] CSV written to {args.out}")
    log("")
    print_summary(summaries)
    return EXIT_OK


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
