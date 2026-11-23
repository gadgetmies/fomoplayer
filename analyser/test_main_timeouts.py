"""A stalled download must not hang the embedding worker (`main.py`).

On 2026-11-16 a download that stopped sending data kept the worker idle for
two hours: urlretrieve waits forever. The stub backend here serves one stored
preview whose audio sends a few bytes and then nothing; main.py must give up
after ANALYSER_DOWNLOAD_TIMEOUT_S, keep the preview queued (no "missing"
report) and finish its batch.
"""

import json
import os
import subprocess
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import embedding  # noqa: F401  (main.py needs track-embedding)
except ImportError:
    embedding = None

ANALYSER_DIR = os.path.dirname(os.path.abspath(__file__))


class _Backend(BaseHTTPRequestHandler):
    served = False
    posted = []

    def log_message(self, *args):
        pass

    def _send_json(self, body):
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith('/api/admin/analyse'):
            cls = type(self)
            tracks = [] if cls.served else [{
                'track_id': 1, 'track_isrc': None,
                'previews': [{'preview_id': 5, 'url': 'https://store.invalid/preview.mp3', 'store': 'Beatport',
                              'audio_url': '/api/storage/preview-audio/stalled.mp3'}],
            }]
            cls.served = True
            self._send_json(tracks)
        elif self.path == '/api/storage/preview-audio/stalled.mp3':
            # Announce a file, send a little of it, then stall.
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', '1000000')
            self.end_headers()
            self.wfile.write(b'\0' * 1000)
            self.wfile.flush()
            time.sleep(60)
        else:
            self.send_error(404)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        type(self).posted.append(json.loads(self.rfile.read(length)))
        self._send_json([])


@unittest.skipIf(embedding is None, 'track-embedding is not installed')
class StalledDownloadTest(unittest.TestCase):
    def test_a_stalled_download_times_out_and_keeps_the_preview_queued(self):
        handler = type('Backend', (_Backend,), {'served': False, 'posted': []})
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.shutdown)

        started = time.monotonic()
        result = subprocess.run(
            [sys.executable, os.path.join(ANALYSER_DIR, 'main.py'), '--skip-sanity-confirmation'],
            capture_output=True, text=True, timeout=50,
            env=dict(os.environ,
                     FOMOPLAYER_API_URL=f'http://127.0.0.1:{server.server_port}/api',
                     FOMOPLAYER_API_KEY='fp_test', ANALYSER_DOWNLOAD_TIMEOUT_S='2',
                     SPOTIPY_CLIENT_ID='test', SPOTIPY_CLIENT_SECRET='test',
                     NO_PROXY='127.0.0.1', no_proxy='127.0.0.1'))
        elapsed = time.monotonic() - started

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('Downloading preview failed', result.stdout)
        self.assertLess(elapsed, 45, 'the worker waited for the stalled download')
        self.assertEqual(handler.posted, [], 'a preview in our own bucket is kept queued, not reported missing')


if __name__ == '__main__':
    unittest.main()
