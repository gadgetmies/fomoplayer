"""End-to-end test of `main.py --audio-samples` against a stub backend.

The stub serves one pending sample (a generated MP3), accepts the embedding
POST and records it. The stored vector must equal what embedding.embed_file
returns for the same file, so samples embedded by main.py and by the
embedding service are interchangeable.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

try:
    import embedding
except ImportError:  # essentia-tensorflow not installed
    embedding = None

ANALYSER_DIR = os.path.dirname(os.path.abspath(__file__))


class _Backend(BaseHTTPRequestHandler):
    audio = b''
    posted = []

    def log_message(self, *args):
        pass

    def _send(self, status, body, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/api/admin/notification-audio-samples/without-embedding'):
            pending = [] if self.posted else [{
                'id': 7, 'url': '/api/storage/sample.mp3', 'filename': 'sample.mp3'}]
            self._send(200, json.dumps(pending).encode())
        elif self.path == '/api/storage/sample.mp3':
            self._send(200, self.audio, 'audio/mpeg')
        else:
            self._send(404, b'{}')

    def do_POST(self):
        body = self.rfile.read(int(self.headers['Content-Length']))
        if self.path == '/api/admin/notification-audio-samples/embeddings':
            type(self).posted.extend(json.loads(body))
            self._send(200, b'[]')
        else:
            self._send(404, b'{}')


@unittest.skipIf(embedding is None, 'essentia-tensorflow is not installed')
@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg is not installed')
class MainAudioSamplesTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='main_audio_samples_test_')
        self.addCleanup(shutil.rmtree, self.dir)
        self.mp3 = os.path.join(self.dir, 'sample.mp3')
        subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
                        'anoisesrc=d=10:c=brown', '-ar', '44100', self.mp3], check=True)
        with open(self.mp3, 'rb') as f:
            handler = type('Backend', (_Backend,), {'audio': f.read(), 'posted': []})
        self.handler = handler
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.shutdown)

    def test_posts_the_shared_module_vector(self):
        # Run from a different working directory: the model path must not depend on cwd.
        result = subprocess.run(
            [sys.executable, os.path.join(ANALYSER_DIR, 'main.py'), '--audio-samples', '--skip-sanity-confirmation'],
            cwd=self.dir, capture_output=True, text=True, timeout=300,
            env=dict(os.environ,
                     FOMOPLAYER_API_URL=f'http://127.0.0.1:{self.server.server_port}/api',
                     FOMOPLAYER_API_KEY='fp_test', TF_CPP_MIN_LOG_LEVEL='3',
                     NO_PROXY='127.0.0.1', no_proxy='127.0.0.1'))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(len(self.handler.posted), 1, result.stdout)
        posted = self.handler.posted[0]
        self.assertEqual((posted['id'], posted['model']), (7, embedding.DEFAULT_MODEL))

        expected = embedding.embed_file(self.mp3, embedding.build_model(), self.dir)
        actual = np.asarray(json.loads(posted['embeddings']))
        cosine = float(actual @ expected / np.linalg.norm(actual) / np.linalg.norm(expected))
        self.assertGreaterEqual(cosine, 0.9999)


if __name__ == '__main__':
    unittest.main()
