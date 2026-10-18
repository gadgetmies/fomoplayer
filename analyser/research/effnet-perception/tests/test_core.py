import sqlite3

import numpy as np
import pytest

import epr.config as config
from epr import catalog, sample


@pytest.fixture
def out(tmp_path, monkeypatch):
    monkeypatch.setattr(config, 'OUT', (tmp_path / 'out').resolve())
    return config.OUT


def test_out_path_refuses_paths_outside_the_output_directory(out):
    assert config.out_path('a', 'b.csv').parent == out / 'a'
    with pytest.raises(config.OutsideOutputDirectory):
        config.out_path('..', 'escape.csv')


def test_snapshot_is_read_only(out, tmp_path):
    src = tmp_path / 'akin.sqlite'
    c = sqlite3.connect(src)
    c.execute('CREATE TABLE t (x)')
    c.execute('INSERT INTO t VALUES (1)')
    c.commit()
    c.close()
    catalog.take_snapshot(src)
    conn = catalog.connect()
    assert conn.execute('SELECT x FROM t').fetchone()[0] == 1
    with pytest.raises(sqlite3.OperationalError):
        conn.execute('INSERT INTO t VALUES (2)')


def tracks(n=60):
    rng = np.random.default_rng(0)
    return [{'track_id': i, 'crates': [f'c{i % 7}'] if i % 3 else [], 'track_genre': ['DnB', 'House', ''][i % 3],
             'duration': float(rng.integers(30, 400))} for i in range(n)]


def test_sampler_is_deterministic_and_skips_short_tracks():
    ok = lambda t: t['duration'] >= sample.MIN_SECONDS
    a = [t['track_id'] for t in sample.stratified(tracks(), 20, seed=3, accept=ok)]
    b = [t['track_id'] for t in sample.stratified(tracks(), 20, seed=3, accept=ok)]
    assert a == b and len(a) == 20
    by = {t['track_id']: t for t in tracks()}
    assert all(by[i]['duration'] >= sample.MIN_SECONDS for i in a)
    assert a != [t['track_id'] for t in sample.stratified(tracks(), 20, seed=4, accept=ok)]


def test_sampler_spreads_over_strata():
    picked = sample.stratified(tracks(), 10, seed=0)
    assert len({sample.stratum(t) for t in picked}) >= 8


@pytest.mark.slow
def test_embedding_has_1280_columns_and_one_row_per_patch():
    from epr import embed
    x = np.random.default_rng(0).standard_normal(16000 * 30).astype(np.float32) * 0.1
    p = embed.patches(x)
    assert p.shape[1] == 1280
    assert abs(p.shape[0] - (30 - config.PATCH_SECONDS) / config.PATCH_HOP_SECONDS) <= 2
