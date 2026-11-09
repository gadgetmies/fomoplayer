"""Unit tests for `analyser/eval/scorer.py` plus a manual parity test
against the production diagnostics endpoint.

Run unit tests:

    cd analyser
    python -m pytest eval/test_scorer.py

Run the parity test (manual, requires backend + fomoplayer CLI):

    EVAL_PARITY_PAIRS="10:20,11:21" \\
    FOMOPLAYER_BACKEND_URL=https://backend.example.com \\
    python -m pytest eval/test_scorer.py::test_parity_against_diagnostics_endpoint

The parity test is skipped when `EVAL_PARITY_PAIRS` is unset, so CI
runs (which do not set the env var) pick up only the unit tests.
"""

import json
import math
import os
import pathlib
import subprocess
import sys
import tempfile
from unittest import mock

import pytest

# Allow running both as `python -m pytest analyser/eval/test_scorer.py`
# (from repo root, package import) and as
# `python -m pytest eval/test_scorer.py` (from analyser/, sibling import).
try:
    from analyser.eval.scorer import (
        DEFAULT_SECONDS_PER_BLOCK,
        stage1_filter,
        stage2_score,
    )
    from analyser.eval import extraction as eval_extraction
except ImportError:  # pragma: no cover - import-path shim
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from eval.scorer import (  # type: ignore[no-redef]
        DEFAULT_SECONDS_PER_BLOCK,
        stage1_filter,
        stage2_score,
    )
    from eval import extraction as eval_extraction  # type: ignore[no-redef]


# ---------- Stage 1 -----------------------------------------------------


def test_stage1_filter_includes_candidate_at_exact_threshold():
    # Boundary inclusion: overlap exactly equal to threshold passes.
    result = stage1_filter({1, 2, 3, 4}, {10: {1, 2}}, 0.5)
    assert result == [10]


def test_stage1_filter_excludes_candidate_below_threshold():
    # Just below threshold: 1/4 = 0.25 < 0.26.
    result = stage1_filter({1, 2, 3, 4}, {10: {1}}, 0.26)
    assert result == []


def test_stage1_filter_returns_all_passing_candidates():
    result = stage1_filter(
        {1, 2, 3, 4},
        {10: {1, 2}, 20: {1, 2, 3}, 30: {99}},
        0.5,
    )
    assert sorted(result) == [10, 20]


def test_stage1_filter_empty_sample_returns_empty():
    # No hashes in the sample → no meaningful ratio; spec implies empty.
    result = stage1_filter(set(), {10: {1, 2}}, 0.0)
    assert result == []


def test_stage1_filter_empty_intersection_excluded():
    result = stage1_filter({1, 2, 3}, {10: {99, 100}}, 0.0001)
    assert result == []


def test_stage1_filter_threshold_zero_includes_overlapping():
    # Threshold 0 means "any non-zero overlap passes".
    result = stage1_filter(
        {1, 2, 3},
        {10: {1}, 20: {99}},
        0.0,
    )
    assert result == [10, 20]


# ---------- Stage 2 -----------------------------------------------------


def test_stage2_score_returns_zero_when_no_shared_hashes():
    sample = [(1, 0), (2, 10)]
    preview = [(99, 0), (100, 5)]
    assert stage2_score(sample, preview, bucket_seconds=0.1) == 0


def test_stage2_score_returns_peak_bucket_count():
    # All three matches share Δt=5 blocks → one bucket, count 3.
    sample = [(1, 0), (2, 10), (3, 20)]
    preview = [(1, 5), (2, 15), (3, 25)]
    score = stage2_score(sample, preview, bucket_seconds=0.1)
    assert score == 3


def test_stage2_score_dominant_bucket_wins():
    # Two matches at Δt=5 blocks, one at Δt=100 blocks → peak count 2.
    sample = [(1, 0), (2, 10), (3, 20)]
    preview = [(1, 5), (2, 15), (3, 120)]
    score = stage2_score(sample, preview, bucket_seconds=0.1)
    assert score == 2


def test_stage2_score_design_md_synthetic_example():
    # From design.md Scenario: two of three matches share the same Δt.
    sample = [(1, 0), (2, 10), (3, 20)]
    preview = [(1, 5), (2, 15), (3, 30)]
    score = stage2_score(
        sample,
        preview,
        bucket_seconds=0.1,
        seconds_per_block=DEFAULT_SECONDS_PER_BLOCK,
    )
    # Δt blocks: 5, 5, 10 → Δt sec: 0.04, 0.04, 0.08
    # Buckets at 0.1s: 0, 0, 0.1 (0.04 rounds to 0; 0.08 rounds to 0.1).
    # Wait: round(0.08/0.1)*0.1 = round(0.8)*0.1 = 1*0.1 = 0.1. So {0:2, 0.1:1}.
    assert score == 2


def test_stage2_score_handles_multi_position_per_hash():
    # Same hash appears at multiple positions in both sample and preview.
    # Cross-join produces 4 pairs; only some share Δt.
    sample = [(1, 0), (1, 100)]
    preview = [(1, 5), (1, 105)]
    # Pairs: (0,5)→Δt=5, (0,105)→Δt=105, (100,5)→Δt=-95, (100,105)→Δt=5.
    # Buckets at 0.05s with seconds_per_block=128/16000≈0.008:
    #   Δt=5 → 0.04 sec → bucket round(0.04/0.05)*0.05 = round(0.8)*0.05 = 0.05
    #   Δt=5 → same bucket 0.05
    #   Δt=-95 and Δt=105 → other buckets.
    # Peak bucket count = 2.
    score = stage2_score(sample, preview, bucket_seconds=0.05)
    assert score == 2


def test_stage2_score_with_seconds_per_block_one_treats_t_as_seconds():
    # Positions already in seconds → pass seconds_per_block=1.0.
    sample = [(1, 0.0), (2, 1.0), (3, 2.0)]
    preview = [(1, 0.5), (2, 1.5), (3, 2.5)]
    # Δt = 0.5 for all three → one bucket, count 3.
    score = stage2_score(
        sample,
        preview,
        bucket_seconds=0.1,
        seconds_per_block=1.0,
    )
    assert score == 3


def test_stage2_score_bucket_rounding_at_seconds_per_block_granularity():
    # Δt of exactly one block at default seconds_per_block:
    #   1 block * (128/16000) = 0.008 sec.
    # With bucket_seconds=0.05, round(0.008/0.05)=round(0.16)=0 → bucket 0.
    sample = [(1, 0)]
    preview = [(1, 1)]
    score = stage2_score(sample, preview, bucket_seconds=0.05)
    assert score == 1


def test_stage2_score_rejects_zero_bucket_seconds():
    with pytest.raises(ValueError):
        stage2_score([(1, 0)], [(1, 0)], bucket_seconds=0)


# ---------- Extraction cache --------------------------------------------


def _make_fake_audio(tmpdir, name="fixture.wav", content=b"fake-audio-bytes"):
    path = os.path.join(tmpdir, name)
    with open(path, "wb") as f:
        f.write(content)
    return path


def test_extract_cache_hit_on_second_call(tmp_path, monkeypatch):
    fake_path = _make_fake_audio(str(tmp_path))
    cache_dir = str(tmp_path / "cache")

    extract_call_count = {"n": 0}

    def fake_extract_panako(audio_path):
        extract_call_count["n"] += 1
        return [{"hash": 42, "position": 0.5, "f1": 100}]

    monkeypatch.setattr(
        eval_extraction, "extract_panako_fingerprints", fake_extract_panako
    )
    # Skip the real download/conversion — point straight at the fixture.
    monkeypatch.setattr(eval_extraction, "_download", lambda url, dd: fake_path)
    monkeypatch.setattr(eval_extraction, "_ensure_wav", lambda p, dd: p)

    first = eval_extraction.extract("https://fixture.invalid/a.wav", cache_dir=cache_dir)
    second = eval_extraction.extract("https://fixture.invalid/a.wav", cache_dir=cache_dir)

    assert first == second
    assert first == [(42, 0.5)]
    assert extract_call_count["n"] == 1, "second call should hit cache"


def test_extract_uncached_runs_panako_every_call(tmp_path, monkeypatch):
    fake_path = _make_fake_audio(str(tmp_path))

    extract_call_count = {"n": 0}

    def fake_extract_panako(audio_path):
        extract_call_count["n"] += 1
        return [{"hash": 7, "position": 0.1, "f1": 1}]

    monkeypatch.setattr(
        eval_extraction, "extract_panako_fingerprints", fake_extract_panako
    )
    monkeypatch.setattr(eval_extraction, "_download", lambda url, dd: fake_path)
    monkeypatch.setattr(eval_extraction, "_ensure_wav", lambda p, dd: p)

    eval_extraction.extract("https://fixture.invalid/a.wav")
    eval_extraction.extract("https://fixture.invalid/a.wav")
    assert extract_call_count["n"] == 2


def test_extract_cache_invalidates_when_panako_args_change(tmp_path, monkeypatch):
    fake_path = _make_fake_audio(str(tmp_path))
    cache_dir = str(tmp_path / "cache")

    extract_call_count = {"n": 0}

    def fake_extract_panako(audio_path):
        extract_call_count["n"] += 1
        return [{"hash": 1, "position": 0.0, "f1": 0}]

    monkeypatch.setattr(
        eval_extraction, "extract_panako_fingerprints", fake_extract_panako
    )
    monkeypatch.setattr(eval_extraction, "_download", lambda url, dd: fake_path)
    monkeypatch.setattr(eval_extraction, "_ensure_wav", lambda p, dd: p)

    # First call — populates cache with the current panako args.
    eval_extraction.extract("https://fixture.invalid/a.wav", cache_dir=cache_dir)
    assert extract_call_count["n"] == 1

    # Pretend the panako CLI args changed (e.g. STRATEGY=OLAF).
    monkeypatch.setattr(
        eval_extraction,
        "PANAKO_CONFIG_ARGS",
        ("STRATEGY=OLAF", "PANAKO_STORAGE=FILE"),
    )

    # Second call should miss the cache because the args-hash differs.
    eval_extraction.extract("https://fixture.invalid/a.wav", cache_dir=cache_dir)
    assert extract_call_count["n"] == 2, "args change must invalidate cache"


# ---------- Parity test (manual) ----------------------------------------


def _parse_parity_pairs(raw):
    pairs = []
    for token in raw.split(','):
        token = token.strip()
        if not token:
            continue
        sample_str, preview_str = token.split(':')
        pairs.append((int(sample_str), int(preview_str)))
    return pairs


def _fomoplayer_query(sql):
    """Invoke `fomoplayer query <SQL>` and return the parsed rows."""
    result = subprocess.run(
        ['fomoplayer', 'query', sql],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "fomoplayer query failed:\n"
            f"  command: fomoplayer query {sql!r}\n"
            f"  stderr: {result.stderr}\n"
            f"  stdout: {result.stdout}"
        )
    return json.loads(result.stdout) if result.stdout.strip() else []


def _fetch_sample_fingerprints(sample_id):
    rows = _fomoplayer_query(
        f"SELECT user_notification_audio_sample_fingerprint_hash AS hash, "
        f"user_notification_audio_sample_fingerprint_position AS position "
        f"FROM user_notification_audio_sample_fingerprint "
        f"WHERE user_notification_audio_sample_id = {int(sample_id)}"
    )
    return [(int(r['hash']), float(r['position'])) for r in rows]


def _fetch_preview_fingerprints(preview_id):
    rows = _fomoplayer_query(
        f"SELECT store__track_preview_fingerprint_hash AS hash, "
        f"store__track_preview_fingerprint_position AS position "
        f"FROM store__track_preview_fingerprint "
        f"WHERE store__track_preview_id = {int(preview_id)}"
    )
    return [(int(r['hash']), float(r['position'])) for r in rows]


def _diagnostics_token():
    """API token for the admin diagnostics endpoint.

    `FOMOPLAYER_API_TOKEN` wins. Otherwise fall back to the key the CLI
    persists via the `conf` package under projectName `fomoplayer` (see
    `packages/cli/src/config.js`) — the same key `fomoplayer login` writes.
    There is no `fomoplayer auth token` subcommand; an earlier version of this
    helper shelled out to one and silently ran unauthenticated when it failed.
    """
    env_token = os.environ.get('FOMOPLAYER_API_TOKEN')
    if env_token:
        return env_token.strip()

    if sys.platform == 'darwin':
        conf_path = (
            pathlib.Path.home()
            / 'Library'
            / 'Preferences'
            / 'fomoplayer-nodejs'
            / 'config.json'
        )
    else:
        base = os.environ.get('XDG_CONFIG_HOME') or (pathlib.Path.home() / '.config')
        conf_path = pathlib.Path(base) / 'fomoplayer-nodejs' / 'config.json'

    try:
        with open(conf_path) as f:
            return json.load(f).get('apiKey') or None
    except (OSError, ValueError):
        return None


def _fetch_diagnostics(sample_id, preview_id, backend_url):
    """Return `(stage2_peak, stage1_ratio)` from the prod diagnostics endpoint.

    `currentScorerWouldReturn` is the **Stage 1** ratio
    (`intersectionHashCount / sampleHashCount`, a float in [0, 1]) — not a
    Stage 2 count. Comparing it against `stage2_score` (a bucket count) is what
    an earlier version of this test did via `int(...)`, which floored every
    non-identical pair to 0 and could never pass. The Stage 2 peak lives in
    `topOffsetBuckets`, which db.js sorts by count descending.
    """
    import urllib.parse
    import urllib.request

    token = _diagnostics_token()
    if not token:
        pytest.skip(
            "No API token for the diagnostics endpoint. Set FOMOPLAYER_API_TOKEN, "
            "or run `fomoplayer login` so the CLI persists an apiKey."
        )

    qs = urllib.parse.urlencode({'sampleId': sample_id, 'previewId': preview_id})
    url = f"{backend_url.rstrip('/')}/api/admin/exact-match/diagnostics?{qs}"
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req) as resp:
        payload = json.load(resp)

    buckets = payload.get('topOffsetBuckets') or []
    stage2_peak = int(buckets[0]['count']) if buckets else 0

    sample_hash_count = int(payload.get('sampleHashCount') or 0)
    intersection = int(payload.get('intersectionHashCount') or 0)
    stage1_ratio = (intersection / sample_hash_count) if sample_hash_count else 0.0
    return stage2_peak, stage1_ratio


@pytest.mark.skipif(
    'EVAL_PARITY_PAIRS' not in os.environ,
    reason=(
        "Parity test against the prod diagnostics endpoint. Set "
        "EVAL_PARITY_PAIRS='sampleId:previewId,sampleId:previewId,...' "
        "and FOMOPLAYER_BACKEND_URL to run."
    ),
)
def test_parity_against_diagnostics_endpoint():
    pairs = _parse_parity_pairs(os.environ['EVAL_PARITY_PAIRS'])
    backend_url = os.environ.get('FOMOPLAYER_BACKEND_URL')
    if not backend_url:
        pytest.skip(
            "FOMOPLAYER_BACKEND_URL must be set to the backend whose "
            "/api/admin/exact-match/diagnostics endpoint will be hit."
        )

    bucket_seconds = float(os.environ.get('EVAL_PARITY_BUCKET_SECONDS', '0.05'))

    failures = []
    stage1_failures = []
    for sample_id, preview_id in pairs:
        sample_fps = _fetch_sample_fingerprints(sample_id)
        preview_fps = _fetch_preview_fingerprints(preview_id)

        # DB positions are stored in seconds (see analyser/extraction.py).
        local_score = stage2_score(
            sample_fps,
            preview_fps,
            bucket_seconds=bucket_seconds,
            seconds_per_block=1.0,
        )
        endpoint_score, endpoint_stage1_ratio = _fetch_diagnostics(
            sample_id, preview_id, backend_url
        )
        if local_score != endpoint_score:
            failures.append(
                (sample_id, preview_id, local_score, endpoint_score)
            )

        # Stage 1 parity too: the Python filter must agree with the ratio the
        # endpoint reports, or a threshold sweep means something different
        # locally than it does in production.
        sample_hash_set = {h for h, _ in sample_fps}
        preview_hash_set = {h for h, _ in preview_fps}
        local_stage1_ratio = (
            len(sample_hash_set & preview_hash_set) / len(sample_hash_set)
            if sample_hash_set
            else 0.0
        )
        if abs(local_stage1_ratio - endpoint_stage1_ratio) > 1e-9:
            stage1_failures.append(
                (sample_id, preview_id, local_stage1_ratio, endpoint_stage1_ratio)
            )

    assert not failures, (
        "Python Stage 2 scorer drifted from the prod diagnostics endpoint:\n"
        + "\n".join(
            f"  sample={s} preview={p}: local={ls} endpoint={es}"
            for s, p, ls, es in failures
        )
    )

    assert not stage1_failures, (
        "Python Stage 1 ratio drifted from the prod diagnostics endpoint:\n"
        + "\n".join(
            f"  sample={s} preview={p}: local={ls:.6f} endpoint={es:.6f}"
            for s, p, ls, es in stage1_failures
        )
    )
