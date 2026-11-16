"""Test doubles for running the preview workers end to end without the real
backend, bucket or Panako: used by test_analyse_previews.py and by
bench_preview_workers.py, which compares the combined worker with the three
separate ones on the same data.

- `StubBackend`: an HTTP server holding previews with stored audio and which
  analyses each has. It serves the combined queue and the three separate
  queues from that one state, serves the audio, and records reports.
- `write_fake_panako(dir)`: a `panako` command that writes `.tdb` files with
  ten fingerprints per second of the WAV it is given (so the duration cap is
  visible), optionally burning CPU per file like the real one.
- `write_fake_minio(dir)`: a `minio` package whose client copies uploads into
  `$FAKE_MINIO_DIR`, for the waveform worker's spawned processes.
"""

import json
import os
import stat
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

MODEL = 'discogs_multi_embeddings-effnet-bs64-1'


class Preview:
    def __init__(self, preview_id, track_id, store, audio, fingerprint=False, embedding=False, waveform=False):
        self.id = preview_id
        self.track_id = track_id
        self.store = store
        self.audio = audio
        self.has = {'fingerprint': fingerprint, 'embedding': embedding, 'waveform': waveform or store != 'Bandcamp'}
        self.missing = False

    @property
    def audio_url(self):
        return f'/api/storage/preview-audio/{self.id}.mp3'

    def needs(self, analysis):
        return not self.missing and not self.has[analysis]


class StubBackend:
    def __init__(self, previews):
        self.previews = {p.id: p for p in previews}
        self.lock = threading.Lock()
        self.downloads = {}
        self.downloading = 0
        self.max_downloading = 0
        self.download_delay = 0
        self.posts = {'analyse': [], 'waveform': [], 'fingerprints': []}
        backend = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _send(self, status, body, content_type='application/json'):
                self.send_response(status)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _json(self, value):
                self._send(200, json.dumps(value).encode())

            def do_GET(self):
                url = urlparse(self.path)
                query = {k: v[0] for k, v in parse_qs(url.query).items()}
                if url.path.startswith('/api/storage/preview-audio/'):
                    preview_id = int(url.path.rsplit('/', 1)[1].split('.')[0])
                    with backend.lock:
                        backend.downloads[preview_id] = backend.downloads.get(preview_id, 0) + 1
                        backend.downloading += 1
                        backend.max_downloading = max(backend.max_downloading, backend.downloading)
                    try:
                        time.sleep(backend.download_delay)
                        self._send(200, backend.previews[preview_id].audio, 'audio/mpeg')
                    finally:
                        with backend.lock:
                            backend.downloading -= 1
                elif url.path == '/api/admin/preview-analysis':
                    self._json(backend.combined_queue(int(query.get('limit', 20))))
                elif url.path == '/api/admin/exact-match/previews/without-fingerprint':
                    self._json(backend.fingerprint_queue(int(query.get('limit', 10))))
                elif url.path == '/api/admin/analyse':
                    self._json(backend.embedding_queue(int(query.get('batch_size', 10))))
                elif url.path == '/api/admin/preview':
                    self._json(backend.waveform_queue(int(query.get('limit', 20))))
                else:
                    self._send(404, b'{}')

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                url = urlparse(self.path)
                with backend.lock:
                    if url.path == '/api/admin/analyse':
                        backend.posts['analyse'].append(body)
                        for entry in body:
                            preview = backend.previews[entry.get('id') or entry.get('preview_id')]
                            if entry.get('missing'):
                                preview.missing = True
                            else:
                                preview.has['embedding'] = True
                    elif url.path == '/api/admin/waveform':
                        backend.posts['waveform'].append(body)
                        for entry in body:
                            backend.previews[entry['id']].has['waveform'] = True
                    elif url.path == '/api/admin/exact-match/previews/fingerprints':
                        backend.posts['fingerprints'].append(
                            {'preview_id': body['preview_id'], 'count': len(body['fingerprints'])})
                        backend.previews[body['preview_id']].has['fingerprint'] = True
                    else:
                        self._send(404, b'{}')
                        return
                self._json({'success': True} if 'fingerprints' in url.path else [])

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    @property
    def api_url(self):
        return f'http://127.0.0.1:{self.server.server_port}/api'

    def close(self):
        self.server.shutdown()
        self.server.server_close()

    def _newest(self, wanted, limit):
        with self.lock:
            return [p for p in sorted(self.previews.values(), key=lambda p: -p.id) if wanted(p)][:limit]

    def combined_queue(self, limit):
        previews = self._newest(lambda p: any(p.needs(a) for a in p.has), limit)
        return [{'preview_id': p.id, 'track_id': p.track_id, 'store_name': p.store,
                 'preview_start_ms': 0, 'preview_end_ms': 1000, 'audio_url': p.audio_url,
                 'needs_fingerprint': p.needs('fingerprint'), 'needs_embedding': p.needs('embedding'),
                 'needs_waveform': p.needs('waveform')} for p in previews]

    def fingerprint_queue(self, limit):
        return [{'preview_id': p.id, 'url': None, 'store_track_id': str(p.id), 'audio_url': p.audio_url,
                 'release_url': None} for p in self._newest(lambda p: p.needs('fingerprint'), limit)]

    def embedding_queue(self, limit):
        return [{'track_id': p.track_id, 'track_isrc': None,
                 'previews': [{'preview_id': p.id, 'url': None, 'store': p.store, 'store_track_id': str(p.id),
                               'audio_url': p.audio_url, 'release_url': None}]}
                for p in self._newest(lambda p: p.needs('embedding'), limit)]

    def waveform_queue(self, limit):
        return [{'id': p.track_id, 'store_name': p.store, 'preview_id': p.id, 'preview_url': None,
                 'preview_start_ms': 0, 'preview_end_ms': 1000, 'url': None, 'store_track_id': str(p.id),
                 'audio_url': p.audio_url, 'release_url': None}
                for p in self._newest(lambda p: p.store == 'Bandcamp' and p.needs('waveform'), limit)]


FAKE_PANAKO = '''#!{python}
import json, os, sys, time, wave, zlib
args = sys.argv[1:]
command = args[0]
config = dict(a.split('=', 1) for a in args[1:] if '=' in a)
files = [a for a in args[1:] if '=' not in a]
cache = config['PANAKO_CACHE_FOLDER']
log = os.environ.get('FAKE_PANAKO_LOG')
if log:
    with open(log, 'a') as f:
        f.write(json.dumps({{'command': command, 'files': len(files)}}) + '\\n')
startup = float(os.environ.get('FAKE_PANAKO_STARTUP_S', '0'))
per_second = float(os.environ.get('FAKE_PANAKO_CPU_PER_AUDIO_SECOND', '0'))
def burn(seconds):
    end = time.process_time() + seconds
    while time.process_time() < end:
        pass
burn(startup)
for path in files:
    file_id = zlib.crc32(os.path.abspath(path).encode()) % 100000000
    if command == 'store':
        with wave.open(path) as w:
            seconds = w.getnframes() / w.getframerate()
        burn(seconds * per_second)
        with open(os.path.join(cache, f'{{file_id}}.tdb'), 'w') as out:
            for i in range(int(seconds * 10)):
                out.write(f'{{1000 + i}} {{file_id}} {{i * 4}} {{i % 128}}\\n')
    elif command == 'resolve':
        print(file_id)
'''

FAKE_MINIO = '''import os, shutil


class Minio:
    def __init__(self, *args, **kwargs):
        pass

    def bucket_exists(self, bucket):
        return True

    def fput_object(self, bucket, name, path):
        shutil.copyfile(path, os.path.join(os.environ['FAKE_MINIO_DIR'], name))
'''


def write_fake_panako(directory):
    path = os.path.join(directory, 'panako')
    with open(path, 'w') as f:
        f.write(FAKE_PANAKO.format(python=sys.executable))
    os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
    return path


def write_fake_minio(directory):
    package = os.path.join(directory, 'minio')
    os.makedirs(package, exist_ok=True)
    with open(os.path.join(package, '__init__.py'), 'w') as f:
        f.write(FAKE_MINIO)
    return directory
