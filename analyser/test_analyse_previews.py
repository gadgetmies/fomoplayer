"""End-to-end test of the combined preview worker (`analyse_previews.py`)
against a stub backend, a stand-in `panako` and a fake bucket client: each
preview is downloaded once, only the analyses it needs run, results equal the
separate workers', WAVs are deleted, and the in-flight limit holds."""

import json
import os
import shutil
import subprocess
import sys
import time

import numpy as np
import pytest

import analysis_fakes
from analysis_fakes import Preview, StubBackend

try:
    import embedding
except ImportError:  # track-embedding not installed
    embedding = None

ANALYSER_DIR = os.path.dirname(os.path.abspath(__file__))

pytestmark = [
    pytest.mark.skipif(embedding is None, reason='track-embedding is not installed'),
    pytest.mark.skipif(not shutil.which('ffmpeg'), reason='ffmpeg is not installed'),
]


def _mp3(path, seconds, colour='pink'):
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
                    f'anoisesrc=d={seconds}:c={colour}:seed=5', '-ac', '2', '-ar', '44100', str(path)], check=True)
    return path.read_bytes()


@pytest.fixture
def env(tmp_path):
    fakes = tmp_path / 'fakes'
    fakes.mkdir()
    analysis_fakes.write_fake_panako(str(fakes))
    analysis_fakes.write_fake_minio(str(fakes))
    uploads = tmp_path / 'uploads'
    uploads.mkdir()
    work = tmp_path / 'work'
    work.mkdir()
    return {
        'tmp': tmp_path, 'uploads': uploads, 'work': work, 'panako_log': tmp_path / 'panako.log',
        'vars': dict(os.environ,
                     PATH=f"{fakes}{os.pathsep}{os.environ['PATH']}",
                     PYTHONPATH=os.pathsep.join([str(fakes), ANALYSER_DIR]),
                     FAKE_MINIO_DIR=str(uploads), FAKE_PANAKO_LOG=str(tmp_path / 'panako.log'),
                     FOMOPLAYER_API_KEY='fp_test', WAVEFORM_STORAGE_HOST='bucket.invalid',
                     WAVEFORM_STORAGE_BUCKET_NAME='waveforms', WAVEFORM_STORAGE_BUCKET_ACCESS_KEY='k',
                     WAVEFORM_STORAGE_BUCKET_SECRET_KEY='s', PREVIEW_MAX_DURATION_S='3',
                     ANALYSER_REPORT_INTERVAL_S='1',
                     NO_PROXY='127.0.0.1', no_proxy='127.0.0.1'),
    }


def _run(env, backend, *args):
    result = subprocess.run(
        [sys.executable, os.path.join(ANALYSER_DIR, 'analyse_previews.py'), '--skip-sanity-confirmation',
         '--sanity-window', '0', '--work-dir', str(env['work']), *args],
        cwd=str(env['tmp']), capture_output=True, text=True, timeout=300,
        env=dict(env['vars'], FOMOPLAYER_API_URL=backend.api_url))
    return result, result.stdout + result.stderr


def _cosine(a, b):
    a, b = np.asarray(a), np.asarray(b)
    return float(a @ b / np.linalg.norm(a) / np.linalg.norm(b))


def test_each_preview_is_downloaded_once_and_gets_only_the_analyses_it_needs(env):
    tmp = env['tmp']
    previews = [
        Preview(4, 40, 'Bandcamp', _mp3(tmp / 'all.mp3', 5)),                       # needs all three
        Preview(3, 30, 'Beatport', _mp3(tmp / 'beatport.mp3', 4, 'brown')),         # fingerprint + embedding
        Preview(2, 20, 'Bandcamp', _mp3(tmp / 'waveform.mp3', 2), fingerprint=True, embedding=True),
        Preview(1, 10, 'Beatport', _mp3(tmp / 'short.mp3', 0.3), fingerprint=True),  # too short to embed
    ]
    backend = StubBackend(previews)
    try:
        result, output = _run(env, backend)
    finally:
        backend.close()

    assert result.returncode == 0, output
    assert backend.downloads == {4: 1, 3: 1, 2: 1, 1: 1}

    # Fingerprints for 4 and 3 only, read up to the 3 s cap (the stand-in
    # writes ten per second of audio it is given).
    assert sorted((p['preview_id'], p['count']) for p in backend.posts['fingerprints']) == [(3, 30), (4, 30)]

    analysed = [e for body in backend.posts['analyse'] for e in body]
    assert sorted(e['id'] for e in analysed if 'embeddings' in e) == [3, 4]
    assert [e for e in analysed if e.get('missing')] == [{'preview_id': 1, 'missing': True}]
    model = embedding.build_model()
    for entry in (e for e in analysed if 'embeddings' in e):
        name = {4: 'all', 3: 'beatport'}[entry['id']]
        expected = embedding.embed_file(str(tmp / f'{name}.mp3'), model)
        assert _cosine(json.loads(entry['embeddings']), expected) >= 0.9999
        assert entry['model'] == embedding.DEFAULT_MODEL

    waveforms = [e for body in backend.posts['waveform'] for e in body]
    assert sorted(e['id'] for e in waveforms) == [2, 4]
    assert len(os.listdir(env['uploads'])) == 2

    # Every download and WAV is gone.
    assert os.listdir(env['work']) == []


def test_loop_drains_the_queue_and_exits_2(env):
    tmp = env['tmp']
    audio = _mp3(tmp / 'a.mp3', 3)
    backend = StubBackend([Preview(i, i, 'Bandcamp', audio) for i in range(1, 9)])
    try:
        result, output = _run(env, backend, '--loop', '--batch-size', '3')
    finally:
        backend.close()
    assert result.returncode == 2, output
    assert backend.downloads == {i: 1 for i in range(1, 9)}
    assert all(not p.needs(a) for p in backend.previews.values() for a in p.has)
    # Fingerprinting batched the WAVs into fewer Panako runs than previews.
    with open(env['panako_log']) as f:
        stores = [json.loads(line) for line in f if '"store"' in line]
    assert sum(s['files'] for s in stores) == 8


def test_in_flight_limit_bounds_downloads(env):
    tmp = env['tmp']
    audio = _mp3(tmp / 'a.mp3', 2)
    backend = StubBackend([Preview(i, i, 'Beatport', audio) for i in range(1, 6)])
    backend.download_delay = 0.2
    try:
        result, output = _run(env, backend, '--max-in-flight', '1', '--download-workers', '4')
    finally:
        backend.close()
    assert result.returncode == 0, output
    assert backend.max_downloading == 1
    assert backend.downloads == {i: 1 for i in range(1, 6)}


def test_empty_queue_exits_2(env):
    backend = StubBackend([])
    try:
        result, output = _run(env, backend, '--loop')
    finally:
        backend.close()
    assert result.returncode == 2, output


def test_a_slow_fingerprint_upload_does_not_hold_back_other_previews(env):
    tmp = env['tmp']
    audio = _mp3(tmp / 'a.mp3', 4)
    previews = [Preview(5, 5, 'Beatport', audio)] + [
        Preview(i, i, 'Beatport', audio, fingerprint=True) for i in (4, 3, 2)]  # embedding only
    backend = StubBackend(previews)
    backend.fingerprint_delay = 8
    try:
        result, output = _run(env, backend, '--max-in-flight', '1')
    finally:
        backend.close()
    assert result.returncode == 0, output
    upload_end = next(t for t, kind, pid in backend.events if kind == 'upload-end' and pid == 5)
    downloaded = {pid: t for t, kind, pid in backend.events if kind == 'download'}
    assert all(downloaded[i] < upload_end for i in (4, 3, 2)), backend.events
    assert all(not p.needs(a) for p in backend.previews.values() for a in p.has)
    assert os.listdir(env['work']) == []


def test_a_preview_waiting_for_its_upload_is_not_fetched_again(env):
    tmp = env['tmp']
    audio = _mp3(tmp / 'a.mp3', 4)
    backend = StubBackend([Preview(i, i, 'Beatport', audio) for i in range(1, 5)])
    backend.fingerprint_delay = 1.5
    try:
        result, output = _run(env, backend, '--loop', '--batch-size', '1')
    finally:
        backend.close()
    assert result.returncode == 2, output
    assert backend.downloads == {i: 1 for i in range(1, 5)}
    assert all(not p.needs(a) for p in backend.previews.values() for a in p.has)


def test_a_failed_fingerprint_upload_leaves_the_preview_queued(env):
    tmp = env['tmp']
    backend = StubBackend([Preview(1, 1, 'Beatport', _mp3(tmp / 'a.mp3', 4))])
    backend.fingerprint_status = 500
    try:
        result, output = _run(env, backend)
    finally:
        backend.close()
    assert result.returncode == 0, output
    preview = backend.previews[1]
    assert preview.needs('fingerprint') and not preview.needs('embedding'), output
    assert os.listdir(env['work']) == []


def test_previews_needing_only_an_embedding_pass_previews_waiting_for_fingerprints(env):
    tmp = env['tmp']
    audio = _mp3(tmp / 'a.mp3', 4)
    needs_fingerprint = [Preview(i, i, 'Beatport', audio) for i in range(12, 4, -1)]   # newest: served first
    embedding_only = [Preview(i, i, 'Beatport', audio, fingerprint=True) for i in range(4, 0, -1)]
    backend = StubBackend(needs_fingerprint + embedding_only)
    backend.fingerprint_delay = 3
    try:
        result, output = _run(env, backend, '--batch-size', '12', '--max-in-flight', '4',
                              '--max-fingerprint-in-flight', '2', '--max-queued-uploads', '1')
    finally:
        backend.close()
    assert result.returncode == 0, output
    second_upload_end = [t for t, kind, _ in backend.events if kind == 'upload-end'][1]
    downloaded = {pid: t for t, kind, pid in backend.events if kind == 'download'}
    assert all(downloaded[p.id] < second_upload_end for p in embedding_only), backend.events
    assert all(not p.needs(a) for p in backend.previews.values() for a in p.has)


def _start(env, backend, pause_file, *args):
    """Start the worker in the background with a pause flag path."""
    return subprocess.Popen(
        [sys.executable, os.path.join(ANALYSER_DIR, 'analyse_previews.py'), '--skip-sanity-confirmation',
         '--sanity-window', '0', '--work-dir', str(env['work']), *args],
        cwd=str(env['tmp']), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        env=dict(env['vars'], FOMOPLAYER_API_URL=backend.api_url, ANALYSER_PAUSE_FILE=str(pause_file)))


def _wait_for(condition, timeout=120):
    deadline = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < deadline, 'timed out'
        time.sleep(0.2)


def _state(pause_file):
    try:
        return (pause_file.parent / (pause_file.name + '.state')).read_text().strip()
    except FileNotFoundError:
        return None


def test_a_worker_paused_from_the_start_downloads_nothing_until_resumed(env):
    tmp = env['tmp']
    audio = _mp3(tmp / 'a.mp3', 4)
    backend = StubBackend([Preview(i, i, 'Beatport', audio) for i in (2, 1)])
    pause_file = tmp / 'pause'
    pause_file.touch()
    worker = _start(env, backend, pause_file)
    try:
        _wait_for(lambda: _state(pause_file) == 'paused')
        time.sleep(3)
        assert backend.downloads == {}
        pause_file.unlink()
        output, _ = worker.communicate(timeout=300)
    finally:
        worker.kill()
        backend.close()
    assert worker.returncode == 0, output
    assert backend.downloads == {2: 1, 1: 1}
    assert all(not p.needs(a) for p in backend.previews.values() for a in p.has)
    assert _state(pause_file) is None


def test_pausing_mid_run_finishes_running_work_and_starts_nothing_new(env):
    tmp = env['tmp']
    audio = _mp3(tmp / 'a.mp3', 4)
    backend = StubBackend([Preview(i, i, 'Beatport', audio) for i in range(8, 0, -1)])
    backend.fingerprint_delay = 2
    pause_file = tmp / 'pause'
    worker = _start(env, backend, pause_file, '--max-in-flight', '2', '--download-workers', '1')
    try:
        _wait_for(lambda: backend.downloads)
        pause_file.touch()
        _wait_for(lambda: _state(pause_file) == 'paused')
        with backend.lock:
            downloads = dict(backend.downloads)
            started = sum(1 for _, kind, _ in backend.events if kind == 'upload-start')
            ended = sum(1 for _, kind, _ in backend.events if kind == 'upload-end')
        assert started == ended          # no upload cut off
        assert len(downloads) < 8        # the rest waits
        time.sleep(4)
        assert backend.downloads == downloads   # nothing new while paused
        pause_file.unlink()
        output, _ = worker.communicate(timeout=300)
    finally:
        worker.kill()
        backend.close()
    assert worker.returncode == 0, output
    assert backend.downloads == {i: 1 for i in range(1, 9)}
    assert all(not p.needs(a) for p in backend.previews.values() for a in p.has)
