"""Unit tests for `cleanup_downloads` and `cleanup_panako_worker_dirs` in
`analyser/extraction.py`.

These tests are pure-Python — no network, Panako, ffmpeg, or DB — and run
anywhere the analyser venv runs.

Run:

    cd analyser
    source venv/bin/activate
    python -m pytest test_cleanup.py
"""

import os
import sys

# Allow `python -m pytest test_cleanup.py` from within analyser/ and
# `python -m pytest analyser/test_cleanup.py` from the repo root alike.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extraction import cleanup_downloads, cleanup_panako_worker_dirs  # noqa: E402


def test_cleanup_downloads_top_level_files(tmp_path, capsys):
    """Regular files at the top level are removed; a populated subdirectory
    and its contents survive."""
    (tmp_path / 'preview_1.mp3').write_bytes(b'mp3')
    (tmp_path / 'preview_1.wav').write_bytes(b'wav')
    archive = tmp_path / 'archive'
    archive.mkdir()
    (archive / 'preview_old.mp3').write_bytes(b'old')

    cleanup_downloads(str(tmp_path))

    assert not (tmp_path / 'preview_1.mp3').exists()
    assert not (tmp_path / 'preview_1.wav').exists()
    assert archive.is_dir()
    assert (archive / 'preview_old.mp3').exists()

    out = capsys.readouterr().out
    assert '[cleanup] downloads/: removed 2 files, 0 errors' in out


def test_cleanup_downloads_tolerates_unwritable_file(tmp_path, monkeypatch, capsys):
    """A per-entry `os.remove` failure is counted and does not abort the
    rest of the cleanup, nor does it raise into the caller."""
    f1 = tmp_path / 'a.mp3'
    f2 = tmp_path / 'b.mp3'  # this one will "fail to remove"
    f3 = tmp_path / 'c.mp3'
    for f in (f1, f2, f3):
        f.write_bytes(b'x')

    real_remove = os.remove

    def fake_remove(path, *args, **kwargs):
        if os.path.abspath(str(path)) == os.path.abspath(str(f2)):
            raise PermissionError('mock: cannot remove this entry')
        return real_remove(path, *args, **kwargs)

    monkeypatch.setattr(os, 'remove', fake_remove)

    # Must not raise.
    cleanup_downloads(str(tmp_path))

    assert not f1.exists()
    assert f2.exists()
    assert not f3.exists()

    out = capsys.readouterr().out
    assert '[cleanup] downloads/: removed 2 files, 1 errors' in out


def test_cleanup_panako_worker_dirs_removes_only_worker_prefix(tmp_path, capsys):
    """Worker dirs are removed; the shared `panako_db/` cache and the
    `downloads/` dir are preserved."""
    (tmp_path / 'panako_db_worker_111').mkdir()
    (tmp_path / 'panako_db_worker_111' / 'foo.tdb').write_bytes(b'foo')
    (tmp_path / 'panako_db_worker_222').mkdir()
    (tmp_path / 'panako_db_worker_222' / 'bar.tdb').write_bytes(b'bar')
    (tmp_path / 'panako_db').mkdir()
    (tmp_path / 'panako_db' / 'keepme.tdb').write_bytes(b'keep')
    (tmp_path / 'downloads').mkdir()
    (tmp_path / 'downloads' / 'keepme.txt').write_bytes(b'keep')

    cleanup_panako_worker_dirs(str(tmp_path))

    assert not (tmp_path / 'panako_db_worker_111').exists()
    assert not (tmp_path / 'panako_db_worker_222').exists()
    assert (tmp_path / 'panako_db').is_dir()
    assert (tmp_path / 'panako_db' / 'keepme.tdb').exists()
    assert (tmp_path / 'downloads').is_dir()
    assert (tmp_path / 'downloads' / 'keepme.txt').exists()

    out = capsys.readouterr().out
    assert '[cleanup] worker dirs: removed 2, 0 errors' in out


def test_cleanup_panako_worker_dirs_skips_non_directories(tmp_path, capsys):
    """A regular file whose name matches the worker prefix is NOT removed —
    the helper only acts on directories."""
    bogus = tmp_path / 'panako_db_worker_oops.txt'
    bogus.write_bytes(b'not a worker dir')
    real_dir = tmp_path / 'panako_db_worker_500'
    real_dir.mkdir()
    (real_dir / 'x.tdb').write_bytes(b'x')

    cleanup_panako_worker_dirs(str(tmp_path))

    assert bogus.exists()
    assert bogus.read_bytes() == b'not a worker dir'
    assert not real_dir.exists()

    out = capsys.readouterr().out
    assert '[cleanup] worker dirs: removed 1, 0 errors' in out
