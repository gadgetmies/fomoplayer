"""Tests for the parallel `panako_processor.py --previews` path.

Two layers:

* Pure-logic tests (the parent-driver cumulative `--score-after` tally, the
  sub-batch splitter, and the helper-promotion regression) run anywhere — no
  network, Panako, or DB.
* Integration tests for `_batched_panako_store` and
  `fingerprint_preview_subbatch` drive real Panako over the `analyser/data`
  fixtures via `file://` URLs and a temp cache dir. They are skipped when
  `panako`/`ffmpeg` are not on PATH so CI without those tools still runs the
  pure tests.

Run:

    cd analyser
    source venv/bin/activate
    python -m pytest test_parallel_preview_fingerprinting.py
"""

import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

# Allow both `python -m pytest analyser/test_...` (package import) and
# `python -m pytest test_...` from within analyser/ (sibling import).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import extraction  # noqa: E402
import panako_processor as pp  # noqa: E402

DATA_DIR = Path(__file__).parent / 'data'
HAVE_PANAKO = shutil.which('panako') is not None
HAVE_FFMPEG = shutil.which('ffmpeg') is not None
panako_required = pytest.mark.skipif(
    not (HAVE_PANAKO and HAVE_FFMPEG),
    reason='panako and ffmpeg must be on PATH for the integration tests',
)


# ---------------------------------------------------------------------------
# Pure logic: parent-driven cumulative --score-after
# ---------------------------------------------------------------------------


def _ok(n):
    """n successful (error=None) sub-batch results."""
    return [{'id': i, 'fp_count': 1, 'error': None} for i in range(n)]


def _fail(n):
    """n failed sub-batch results (do not count toward the tally)."""
    return [{'id': i, 'fp_count': 0, 'error': 'boom'} for i in range(n)]


def test_score_fires_twice_for_2300_uploads_at_threshold_1000():
    fired = []
    # 2300 successful uploads arriving as five out-of-order sub-batches.
    completed = [_ok(500), _ok(800), _ok(300), _ok(400), _ok(300)]
    total = pp._tally_and_score(completed, score_after=1000, score_fn=fired.append)
    assert total == 2300
    # Crosses 1000 and 2000 → exactly two scoring passes.
    assert fired == [1000, 2000]


def test_out_of_order_arrival_does_not_change_tally_or_firing():
    runs = []
    for order in ([_ok(900), _ok(900), _ok(500)],
                  [_ok(500), _ok(900), _ok(900)],
                  [_ok(900), _ok(500), _ok(900)]):
        fired = []
        total = pp._tally_and_score(order, score_after=1000, score_fn=fired.append)
        runs.append((total, fired))
    # Total and the set of crossings are identical regardless of arrival order.
    assert all(total == 2300 for total, _ in runs)
    assert all(fired == [1000, 2000] for _, fired in runs)


def test_failed_uploads_do_not_count_toward_score_threshold():
    fired = []
    # 600 ok + 600 failed: cumulative successful never reaches 1000.
    total = pp._tally_and_score([_ok(600), _fail(600)], score_after=1000, score_fn=fired.append)
    assert total == 600
    assert fired == []


def test_below_threshold_run_does_not_score():
    fired = []
    total = pp._tally_and_score([_ok(10)], score_after=1000, score_fn=fired.append)
    assert total == 10
    assert fired == []


def test_score_after_zero_disables_scoring():
    fired = []
    total = pp._tally_and_score([_ok(5000)], score_after=0, score_fn=fired.append)
    assert total == 5000
    assert fired == []


def test_single_large_subbatch_crossing_two_boundaries_fires_twice():
    fired = []
    # One sub-batch jumps the cumulative from 0 past both 1000 and 2000.
    total = pp._tally_and_score([_ok(2100)], score_after=1000, score_fn=fired.append)
    assert total == 2100
    assert fired == [1000, 2000]


# ---------------------------------------------------------------------------
# Pure logic: sub-batch splitting
# ---------------------------------------------------------------------------


def test_split_into_chunks_at_most_n_near_equal():
    chunks = pp._split_into_chunks(list(range(40)), 8)
    assert len(chunks) == 8
    assert [len(c) for c in chunks] == [5] * 8
    # No item dropped or duplicated.
    assert [x for c in chunks for x in c] == list(range(40))


def test_split_into_chunks_uneven_division():
    chunks = pp._split_into_chunks(list(range(10)), 3)
    assert [len(c) for c in chunks] == [4, 3, 3]


def test_split_into_chunks_single_worker_is_one_chunk():
    items = list(range(40))
    assert pp._split_into_chunks(items, 1) == [items]


def test_split_into_chunks_fewer_items_than_workers_has_no_empty_chunks():
    chunks = pp._split_into_chunks([1, 2, 3], 8)
    assert chunks == [[1], [2], [3]]
    assert all(len(c) > 0 for c in chunks)


# ---------------------------------------------------------------------------
# Regression: promoted helpers are shared, run_fingerprint still imports
# ---------------------------------------------------------------------------


def test_run_fingerprint_and_report_uses_promoted_helpers():
    import run_fingerprint_and_report as rfr
    assert rfr._batched_panako_store is extraction._batched_panako_store
    assert rfr._worker_cache_dir is extraction._worker_cache_dir


def test_panako_processor_reexports_moved_names():
    assert pp.fingerprint_preview_subbatch is extraction.fingerprint_preview_subbatch
    assert pp.upload_preview_fingerprints is extraction.upload_preview_fingerprints
    assert pp._batched_panako_store is extraction._batched_panako_store
    assert pp._worker_cache_dir is extraction._worker_cache_dir


def test_worker_cache_dir_is_pid_isolated():
    # The cache folder is keyed by PID, so distinct worker processes (distinct
    # sub-batches) never share a PANAKO_CACHE_FOLDER.
    cache_dir = extraction._worker_cache_dir()
    assert f'panako_db_worker_{os.getpid()}' in cache_dir
    assert os.path.isdir(cache_dir)


# ---------------------------------------------------------------------------
# Integration: real Panako over the data fixtures
# ---------------------------------------------------------------------------


@panako_required
def test_batched_panako_store_distinct_cache_dirs_are_isolated():
    """Two sub-batches given distinct cache dirs write their .tdb files into
    their own dir and never into the other's."""
    fixtures = [DATA_DIR / 'mantra_preview.mp3', DATA_DIR / 'serious_sound_preview.mp3']
    with tempfile.TemporaryDirectory() as d1, tempfile.TemporaryDirectory() as d2:
        ids1 = extraction._batched_panako_store([str(fixtures[0])], d1)
        ids2 = extraction._batched_panako_store([str(fixtures[1])], d2)
        assert len(ids1) == 1 and len(ids2) == 1
        tdb1 = os.path.join(d1, f'{ids1[0]}.tdb')
        tdb2 = os.path.join(d2, f'{ids2[0]}.tdb')
        assert os.path.exists(tdb1), 'first sub-batch .tdb missing from its own cache'
        assert os.path.exists(tdb2), 'second sub-batch .tdb missing from its own cache'
        # Each cache holds only its own sub-batch's fingerprint db.
        assert not os.path.exists(os.path.join(d1, f'{ids2[0]}.tdb'))
        assert not os.path.exists(os.path.join(d2, f'{ids1[0]}.tdb'))
        # And the fingerprints are non-empty.
        assert extraction.read_tdb_file(tdb1)
        assert extraction.read_tdb_file(tdb2)


@panako_required
def test_fingerprint_preview_subbatch_isolates_one_bad_file(monkeypatch):
    """A sub-batch with one un-downloadable preview still fingerprints and
    uploads the good ones; the bad one is reported with its id."""
    uploaded = {}

    def fake_upload(preview_id, fingerprints):
        uploaded[preview_id] = len(fingerprints)
        return {'ok': True}

    # The worker resolves `upload_preview_fingerprints` as an extraction
    # module global at call time, so patching it here intercepts the upload
    # without touching the backend.
    monkeypatch.setattr(extraction, 'upload_preview_fingerprints', fake_upload)

    good1 = DATA_DIR / 'mantra_preview.mp3'
    good2 = DATA_DIR / 'serious_sound_preview.mp3'
    jobs = [
        {'id': 101, 'url': good1.as_uri()},
        {'id': 102, 'url': (DATA_DIR / 'does_not_exist.mp3').as_uri()},
        {'id': 103, 'url': good2.as_uri()},
    ]
    results = extraction.fingerprint_preview_subbatch(jobs)
    by_id = {r['id']: r for r in results}

    assert set(by_id) == {101, 102, 103}
    # The bad file failed in Phase A and did not sink the others.
    assert by_id[102]['error'] is not None
    assert by_id[101]['error'] is None and by_id[101]['fp_count'] > 0
    assert by_id[103]['error'] is None and by_id[103]['fp_count'] > 0
    # Only the good previews were uploaded.
    assert set(uploaded) == {101, 103}
    assert uploaded[101] > 0 and uploaded[103] > 0
