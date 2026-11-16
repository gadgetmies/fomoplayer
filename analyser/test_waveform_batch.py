"""waveform.process_batch prefetches downloads in parallel for audio stored in
our bucket, keeps Bandcamp fetches one at a time, and reports in queue order."""

import os
import shutil
import subprocess
import sys
import threading
import time
import types

import pytest

pytestmark = pytest.mark.skipif(not shutil.which('ffmpeg'), reason='ffmpeg is not installed')


@pytest.fixture
def waveform(monkeypatch):
    """waveform.py connects to its bucket on import: stand a fake client in."""
    fake_minio = types.ModuleType("minio")

    class FakeMinio:
        def __init__(self, *_args, **_kwargs):
            pass

        def bucket_exists(self, _bucket):
            return True

    fake_minio.Minio = FakeMinio
    monkeypatch.setitem(sys.modules, "minio", fake_minio)
    monkeypatch.delitem(sys.modules, "waveform", raising=False)
    import waveform as module
    return module


@pytest.fixture
def mp3(tmp_path):
    path = tmp_path / 'source.mp3'
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
                    'anoisesrc=d=3:c=pink', '-ar', '44100', str(path)], check=True)
    return path


class _Downloads:
    def __init__(self, source):
        self.source = source
        self.lock = threading.Lock()
        self.running = {'bucket': 0, 'store': 0}
        self.max_running = {'bucket': 0, 'store': 0}
        self.paths = []

    def __call__(self, url, path):
        kind = 'bucket' if '/storage/' in url else 'store'
        with self.lock:
            self.running[kind] += 1
            self.max_running[kind] = max(self.max_running[kind], self.running[kind])
            self.paths.append(path)
        try:
            time.sleep(0.1)
            shutil.copyfile(self.source, path)
        finally:
            with self.lock:
                self.running[kind] -= 1


def _stored(preview_id):
    return {'preview_id': preview_id, 'id': preview_id * 10, 'store_name': 'Bandcamp',
            'audio_url': f'/api/storage/preview-audio/{preview_id}.mp3',
            'preview_start_ms': 0, 'preview_end_ms': 3000}


def _from_bandcamp(preview_id):
    return {'preview_id': preview_id, 'id': preview_id * 10, 'store_name': 'Bandcamp', 'preview_url': None,
            'release_url': f'https://artist.bandcamp.com/album/{preview_id}', 'store_track_id': str(preview_id),
            'preview_start_ms': 0, 'preview_end_ms': 3000}


def test_stored_previews_download_in_parallel_and_report_in_order(monkeypatch, waveform, mp3):
    downloads = _Downloads(mp3)
    uploads, posts = [], []
    monkeypatch.setattr(waveform, 'download', downloads)
    monkeypatch.setattr(waveform, 'upload_waveform', lambda png: uploads.append(os.path.getsize(png)) or f'/w/{len(uploads)}.png')
    monkeypatch.setattr(waveform, 'post_to_api', lambda path, payload: posts.append((path, payload)))

    done, missing = waveform.process_batch([_stored(i) for i in range(1, 7)], waveform.Backoff(), {},
                                           download_workers=3)

    assert (done, missing) == (6, 0)
    assert downloads.max_running['bucket'] == 3
    assert all(size > 0 for size in uploads)
    assert [(path, [d['id'] for d in payload]) for path, payload in posts] == [('/admin/waveform', [1, 2, 3, 4, 5, 6])]
    # Downloads and decoded files are removed as they are used.
    assert not any(os.path.exists(p) for p in downloads.paths)


def test_bandcamp_previews_are_fetched_one_at_a_time(monkeypatch, waveform, mp3):
    downloads = _Downloads(mp3)
    posts = []
    monkeypatch.setattr(waveform, 'download', downloads)
    monkeypatch.setattr(waveform, 'upload_waveform', lambda png: '/w.png')
    monkeypatch.setattr(waveform, 'post_to_api', lambda path, payload: posts.append((path, payload)))
    # Preview 3 is no longer streamed by Bandcamp.
    monkeypatch.setattr(waveform.bandcamp, 'resolve_stream_url',
                        lambda release_url, track_id: None if track_id == '3' else f'https://bc.invalid/{track_id}')

    previews = [_from_bandcamp(1), _stored(2), _from_bandcamp(3), _from_bandcamp(4), _stored(5)]
    done, missing = waveform.process_batch(previews, waveform.Backoff(), {}, download_workers=4)

    assert (done, missing) == (4, 1)
    assert downloads.max_running['store'] == 1
    assert posts == [
        ('/admin/waveform', [{'id': i, 'waveform_url': '/w.png', 'waveform_start_ms': 0, 'waveform_end_ms': 3000}
                             for i in (1, 2, 4, 5)]),
        ('/admin/analyse', [{'preview_id': 3, 'missing': True}]),
    ]


def test_a_failed_download_counts_an_attempt(monkeypatch, waveform, mp3):
    def failing(url, path):
        raise OSError('bucket unavailable')

    monkeypatch.setattr(waveform, 'download', failing)
    monkeypatch.setattr(waveform, 'post_to_api', lambda *_: None)
    attempts = {}
    assert waveform.process_batch([_stored(1)], waveform.Backoff(), attempts) == (0, 0)
    assert attempts == {1: 1}
