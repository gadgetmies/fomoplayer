"""Unit tests for `analyser/eval/sweep.py`.

These tests use fakes for `fomoplayer query` and the extractor so they
run in CI without network, panako, or fomoplayer on PATH.
"""

import csv
import io
import json
import os
import subprocess
import sys

import pytest

try:
    from analyser.eval import sweep as sweep_mod
    from analyser.eval import scorer as scorer_mod
except ImportError:  # pragma: no cover - import-path shim
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from eval import sweep as sweep_mod  # type: ignore[no-redef]
    from eval import scorer as scorer_mod  # type: ignore[no-redef]


# ---------- pick_distractors --------------------------------------------


def test_pick_distractors_deterministic_per_sample():
    pool = list(range(100, 200))
    a = sweep_mod.pick_distractors(pool, {150}, count=5, seed=42, sample_id=1)
    b = sweep_mod.pick_distractors(pool, {150}, count=5, seed=42, sample_id=1)
    assert a == b


def test_pick_distractors_varies_by_sample_id():
    pool = list(range(100, 200))
    a = sweep_mod.pick_distractors(pool, set(), count=5, seed=42, sample_id=1)
    b = sweep_mod.pick_distractors(pool, set(), count=5, seed=42, sample_id=2)
    assert a != b


def test_pick_distractors_excludes_expected():
    pool = list(range(100, 110))
    expected = {101, 103, 105}
    picked = sweep_mod.pick_distractors(pool, expected, count=5, seed=42, sample_id=1)
    assert not (set(picked) & expected)
    assert len(picked) == 5


def test_pick_distractors_count_larger_than_pool_returns_all_available():
    pool = [1, 2, 3]
    picked = sweep_mod.pick_distractors(pool, {2}, count=20, seed=42, sample_id=1)
    assert set(picked) == {1, 3}


# ---------- sweep + CSV -------------------------------------------------


def test_sweep_writes_csv_with_documented_columns(tmp_path):
    # One sample (id=1) with one expected preview (id=10) and one
    # distractor (id=20). Expected matches the sample's hashes; the
    # distractor doesn't.
    pairs_by_sample = {1: {10}}
    distractors_by_sample = {1: [20]}

    sample_fp = [(0xAA, 0.0), (0xBB, 1.0), (0xCC, 2.0)]
    expected_fp = [(0xAA, 0.5), (0xBB, 1.5), (0xCC, 2.5)]
    distractor_fp = [(0xDD, 0.0), (0xEE, 1.0)]

    sample_fps = {1: sample_fp}
    preview_fps = {10: expected_fp, 20: distractor_fp}

    out_csv = str(tmp_path / "results.csv")
    summaries = sweep_mod.sweep(
        pairs_by_sample,
        distractors_by_sample,
        sample_fps,
        preview_fps,
        thresholds=(0.5,),
        bucket_seconds_grid=(0.1,),
        out_csv_path=out_csv,
        scorer=scorer_mod,
        log_fn=lambda *_: None,
    )

    with open(out_csv) as f:
        rows = list(csv.DictReader(f))

    assert {row["candidate_id"] for row in rows} == {"10", "20"}
    columns = set(rows[0].keys())
    assert columns == set(sweep_mod.CSV_COLUMNS)
    # Expected preview should pass Stage 1 and have non-zero Stage 2 score.
    expected_row = next(r for r in rows if r["candidate_id"] == "10")
    assert expected_row["stage1_passed"] == "1"
    assert int(expected_row["stage2_score"]) > 0
    assert expected_row["is_expected"] == "1"
    # Distractor should not pass Stage 1.
    distractor_row = next(r for r in rows if r["candidate_id"] == "20")
    assert distractor_row["stage1_passed"] == "0"
    assert distractor_row["is_expected"] == "0"

    assert len(summaries) == 1
    summary = summaries[0]
    assert summary["top1"] == 1.0  # expected ranks above distractor
    assert summary["recall"] == 1.0
    assert summary["fpr"] == 0.0
    assert summary["samples"] == 1


def test_sweep_marks_extraction_failure_rows(tmp_path):
    pairs_by_sample = {1: {10}}
    distractors_by_sample = {1: [20]}
    sample_fps = {1: [(0xAA, 0.0)]}
    preview_fps = {10: None, 20: [(0xAA, 0.0)]}  # expected failed to extract

    out_csv = str(tmp_path / "results.csv")
    sweep_mod.sweep(
        pairs_by_sample,
        distractors_by_sample,
        sample_fps,
        preview_fps,
        thresholds=(0.5,),
        bucket_seconds_grid=(0.1,),
        out_csv_path=out_csv,
        scorer=scorer_mod,
        log_fn=lambda *_: None,
    )

    with open(out_csv) as f:
        rows = list(csv.DictReader(f))
    failed_row = next(r for r in rows if r["candidate_id"] == "10")
    assert failed_row["extraction_failed"] == "true"
    ok_row = next(r for r in rows if r["candidate_id"] == "20")
    assert ok_row["extraction_failed"] == "false"


def test_sweep_handles_sample_extraction_failure(tmp_path):
    pairs_by_sample = {1: {10}}
    distractors_by_sample = {1: [20]}
    sample_fps = {1: None}  # sample itself failed
    preview_fps = {10: [(0xAA, 0.0)], 20: [(0xBB, 0.0)]}

    out_csv = str(tmp_path / "results.csv")
    sweep_mod.sweep(
        pairs_by_sample,
        distractors_by_sample,
        sample_fps,
        preview_fps,
        thresholds=(0.5,),
        bucket_seconds_grid=(0.1,),
        out_csv_path=out_csv,
        scorer=scorer_mod,
        log_fn=lambda *_: None,
    )

    with open(out_csv) as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 2
    assert all(r["extraction_failed"] == "true" for r in rows)


# ---------- fomoplayer_query wrapper ------------------------------------


def test_fomoplayer_query_raises_when_cli_missing(monkeypatch):
    def boom(*a, **kw):
        raise FileNotFoundError(2, "fomoplayer not found")

    monkeypatch.setattr(subprocess, "run", boom)
    with pytest.raises(sweep_mod.FomoplayerQueryError) as exc:
        sweep_mod.fomoplayer_query("SELECT 1")
    assert "not on PATH" in str(exc.value)


def test_fomoplayer_query_surfaces_nonzero_exit(monkeypatch):
    class FakeResult:
        returncode = 1
        stderr = "ERROR: relation 'sample_match_eval_pair' does not exist"
        stdout = ""

    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: FakeResult())
    with pytest.raises(sweep_mod.FomoplayerQueryError) as exc:
        sweep_mod.fomoplayer_query("SELECT 1")
    assert "does not exist" in str(exc.value)


def test_fomoplayer_query_parses_json_array(monkeypatch):
    class FakeResult:
        returncode = 0
        stderr = ""
        stdout = json.dumps([{"id": 1}, {"id": 2}])

    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: FakeResult())
    rows = sweep_mod.fomoplayer_query("SELECT 1")
    assert rows == [{"id": 1}, {"id": 2}]


def test_fetch_pairs_exits_on_missing_table(monkeypatch):
    def fake_query(sql, **kwargs):
        raise sweep_mod.FomoplayerQueryError(
            "fomoplayer query failed (exit 1):\n"
            "  SQL: ...\n"
            "  stderr: relation \"sample_match_eval_pair\" does not exist\n"
            "  stdout: "
        )

    monkeypatch.setattr(sweep_mod, "fomoplayer_query", fake_query)
    with pytest.raises(SystemExit) as exc:
        sweep_mod.fetch_pairs("fomoplayer")
    assert "Apply the migration" in str(exc.value)


def test_fetch_pairs_groups_by_sample(monkeypatch):
    rows = [
        {"sample_id": 1, "preview_id": 10},
        {"sample_id": 1, "preview_id": 11},
        {"sample_id": 2, "preview_id": 20},
    ]
    monkeypatch.setattr(sweep_mod, "fomoplayer_query", lambda sql, **kw: rows)
    result = sweep_mod.fetch_pairs("fomoplayer")
    assert result == {1: {10, 11}, 2: {20}}


# ---------- empty table exit path --------------------------------------


def test_main_exits_zero_on_empty_pairs(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(sweep_mod, "fomoplayer_api_url", lambda *a, **kw: "https://x")
    monkeypatch.setattr(sweep_mod, "fetch_pairs", lambda *a, **kw: {})

    rc = sweep_mod.main(["--out", str(tmp_path / "out.csv")])
    assert rc == sweep_mod.EXIT_OK
    out = capsys.readouterr().out
    assert "no pairs to evaluate" in out


def test_sweep_metrics_respond_to_threshold(tmp_path):
    """Raising the Stage 1 threshold past a pair's overlap must drop it.

    Regression test. An earlier version ranked *every* candidate, including
    the ones Stage 1 rejected, so `top1` / `top5` / `fpr` were identical for
    every threshold in the grid and the sweep could not answer the question it
    exists to answer ("where should SAMPLE_MATCH_DEFAULT_THRESHOLD sit?").
    """
    pairs_by_sample = {1: {10}}
    distractors_by_sample = {1: [20]}

    # Expected preview shares 2 of the sample's 4 hashes → Stage 1 ratio 0.5.
    sample_fp = [(0xAA, 0.0), (0xBB, 1.0), (0xCC, 2.0), (0xDD, 3.0)]
    expected_fp = [(0xAA, 0.5), (0xBB, 1.5)]
    distractor_fp = [(0xEE, 0.0), (0xFF, 1.0)]

    sample_fps = {1: sample_fp}
    preview_fps = {10: expected_fp, 20: distractor_fp}

    summaries = sweep_mod.sweep(
        pairs_by_sample,
        distractors_by_sample,
        sample_fps,
        preview_fps,
        thresholds=(0.25, 0.9),
        bucket_seconds_grid=(0.1,),
        out_csv_path=str(tmp_path / "results.csv"),
        scorer=scorer_mod,
        log_fn=lambda *_: None,
    )

    by_threshold = {s["threshold"]: s for s in summaries}
    assert set(by_threshold) == {0.25, 0.9}

    # 0.5 overlap clears a 0.25 threshold: the expected preview is ranked first.
    assert by_threshold[0.25]["top1"] == 1.0
    assert by_threshold[0.25]["recall"] == 1.0

    # 0.5 overlap does not clear 0.9: nothing survives Stage 1, so there is no
    # top-1 hit and nothing to recall.
    assert by_threshold[0.9]["top1"] == 0.0
    assert by_threshold[0.9]["recall"] == 0.0

    # The whole point: the grid must actually discriminate.
    assert by_threshold[0.25]["top1"] != by_threshold[0.9]["top1"]


def test_sweep_excludes_unextractable_expected_from_fpr(tmp_path):
    """A sample whose expected preview failed extraction is not a false positive.

    It is excluded from the FPR denominator and reported separately, so the
    metric measures matcher precision rather than extraction health.
    """
    pairs_by_sample = {1: {10}}
    distractors_by_sample = {1: [20]}

    sample_fps = {1: [(0xAA, 0.0), (0xBB, 1.0)]}
    # Expected preview could not be extracted; the distractor could.
    preview_fps = {10: None, 20: [(0xAA, 0.5), (0xBB, 1.5)]}

    summaries = sweep_mod.sweep(
        pairs_by_sample,
        distractors_by_sample,
        sample_fps,
        preview_fps,
        thresholds=(0.5,),
        bucket_seconds_grid=(0.1,),
        out_csv_path=str(tmp_path / "results.csv"),
        scorer=scorer_mod,
        log_fn=lambda *_: None,
    )

    summary = summaries[0]
    assert summary["fp_excluded_extraction_failed"] == 1
    assert summary["fp_scored_samples"] == 0
    # Not charged as a false positive despite the distractor ranking first.
    assert summary["fpr"] == 0.0
