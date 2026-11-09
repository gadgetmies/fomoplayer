"""Read-only access to the AKIN catalog.

The catalog is AKIN's live database and is slow to query while the app writes to it, so the run works from a
snapshot taken once with SQLite's backup API (the source is opened with mode=ro). The snapshot itself is also only
opened read-only.
"""
import sqlite3

import numpy as np

from .config import CATALOG, out_path


def _ro(path):
    return sqlite3.connect(f'file:{path}?mode=ro', uri=True, timeout=60)


def snapshot_path():
    return out_path('catalog', 'snapshot.sqlite')


def take_snapshot(source=CATALOG):
    dest = snapshot_path()
    tmp = dest.with_suffix('.tmp')
    if tmp.exists():
        tmp.unlink()
    src = _ro(source)
    dst = sqlite3.connect(tmp)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    tmp.replace(dest)
    return dest


def connect():
    path = snapshot_path()
    if not path.exists():
        take_snapshot()
    conn = _ro(path)
    conn.row_factory = sqlite3.Row
    return conn


def tracks(conn):
    """Present tracks with their metadata, beat grid and hand-made crates."""
    rows = conn.execute("""
        SELECT t.track_id, t.track_path, t.track_artist, t.track_title, t.track_key, t.track_bpm, t.track_genre,
               t.track_energy, t.track_label, g.first_beat_ms, g.bpm AS grid_bpm
        FROM track t LEFT JOIN track_beat_grid g ON g.track_id = t.track_id
        WHERE t.track_missing = 0 AND t.track_path IS NOT NULL
    """).fetchall()
    crates = {}
    for r in conn.execute("""
        SELECT ct.track_id, c.crate_name FROM crate_track ct JOIN crate c ON c.crate_id = ct.crate_id
        WHERE c.managed_kind IS NULL OR c.managed_kind = 'smart-group'
    """):
        crates.setdefault(r['track_id'], []).append(r['crate_name'])
    out = []
    for r in rows:
        d = dict(r)
        d['crates'] = crates.get(d['track_id'], [])
        out.append(d)
    return out


def stems(conn, track_id):
    return {r['stem_type']: r['stem_path'] for r in conn.execute(
        "SELECT stem_type, stem_path FROM track_stem WHERE track_id = ? AND model = 'htdemucs'", (track_id,))}


def stored_means(conn, embedding_type='multi'):
    """AKIN's stored 1280-d means (sqlite-vec vec0 table). Returns {track_id: vector}."""
    import sqlite_vec
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    out = {}
    for r in conn.execute(
            'SELECT track_id, track_embedding_vector FROM track_embedding WHERE track_embedding_type = ?',
            (embedding_type,)):
        out[r[0]] = np.frombuffer(r[1], dtype=np.float32).copy()
    return out
