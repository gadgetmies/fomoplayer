"""End-to-end test of `main.py`'s preview branch against a stub backend.

The stub serves batches of tracks whose previews are stored in "our bucket"
(generated audio). It checks that `--loop` keeps one model across batches and
exits 2 once the queue is empty, that each batch is reported in one
`POST /admin/analyse` in queue order, that the stored vectors equal what
`embedding.embed_file` returns, and that a failed batch report is resent one
entry at a time.
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


def _track(track_id, preview_id, audio):
    return {'track_id': track_id, 'track_isrc': None,
            'previews': [{'preview_id': preview_id, 'store': 'Beatport',
                          'url': 'https://store.invalid/preview.mp3',
                          'audio_url': f'/api/storage/preview-audio/{audio}.mp3'}]}


class _Backend(BaseHTTPRequestHandler):
    audio = {}
    batches = []
    posted = []
    fail_batch_reports = False

    def log_message(self, *args):
        pass

    def _send(self, status, body, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        cls = type(self)
        if self.path.startswith('/api/admin/analyse'):
            batch = cls.batches.pop(0) if cls.batches else []
            self._send(200, json.dumps(batch).encode())
        elif self.path.startswith('/api/storage/preview-audio/'):
            name = self.path.rsplit('/', 1)[1][:-len('.mp3')]
            self._send(200, cls.audio[name], 'audio/mpeg')
        else:
            self._send(404, b'{}')

    def do_POST(self):
        cls = type(self)
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.path != '/api/admin/analyse':
            self._send(404, b'{}')
            return
        cls.posted.append(body)
        if cls.fail_batch_reports and len(body) > 1:
            self._send(500, b'{"error":"one entry failed"}')
        else:
            self._send(200, b'[]')


@unittest.skipIf(embedding is None, 'essentia-tensorflow is not installed')
@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg is not installed')
class MainPreviewsTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='main_previews_test_')
        self.addCleanup(shutil.rmtree, self.dir)
        self.audio = {}
        for name, seconds, colour in [('a', 8, 'brown'), ('b', 6, 'pink'), ('c', 7, 'white'), ('short', 0.3, 'pink')]:
            path = os.path.join(self.dir, f'{name}.mp3')
            subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
                            f'anoisesrc=d={seconds}:c={colour}:seed=7', '-ar', '44100', path], check=True)
            with open(path, 'rb') as f:
                self.audio[name] = f.read()

    def _serve(self, batches, fail_batch_reports=False):
        handler = type('Backend', (_Backend,), {'audio': self.audio, 'batches': batches, 'posted': [],
                                                'fail_batch_reports': fail_batch_reports})
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return handler, server

    def _run(self, server, *extra):
        return subprocess.run(
            [sys.executable, os.path.join(ANALYSER_DIR, 'main.py'), '--skip-sanity-confirmation',
             '--sanity-window', '0', *extra],
            cwd=self.dir, capture_output=True, text=True, timeout=300,
            env=dict(os.environ,
                     FOMOPLAYER_API_URL=f'http://127.0.0.1:{server.server_port}/api',
                     FOMOPLAYER_API_KEY='fp_test', SPOTIPY_CLIENT_ID='test', SPOTIPY_CLIENT_SECRET='test',
                     TF_CPP_MIN_LOG_LEVEL='3', ANALYSER_NO_PROGRESS_WAIT_S='0',
                     NO_PROXY='127.0.0.1', no_proxy='127.0.0.1'))

    def _assert_vector(self, entry, name):
        path = os.path.join(self.dir, f'{name}.mp3')
        expected = embedding.embed_file(path, self.model, self.dir)
        actual = np.asarray(json.loads(entry['embeddings']))
        cosine = float(actual @ expected / np.linalg.norm(actual) / np.linalg.norm(expected))
        self.assertGreaterEqual(cosine, 0.9999, name)

    @classmethod
    def setUpClass(cls):
        cls.model = embedding.build_model()

    def test_loop_keeps_one_model_and_reports_each_batch_once(self):
        handler, server = self._serve([
            [_track(1, 11, 'a'), _track(2, 12, 'short'), _track(3, 13, 'b')],
            [_track(4, 14, 'c')],
        ])
        result = self._run(server, '--loop', '--download-workers', '3')
        output = result.stdout + result.stderr

        self.assertEqual(result.returncode, 2, output)
        self.assertEqual(output.count('Preparing model'), 1, output)
        self.assertEqual(len(handler.posted), 2, handler.posted)

        first, second = handler.posted
        # Queue order: preview 11, then 12 (too short, reported missing), then 13.
        self.assertEqual([e.get('id') or e.get('preview_id') for e in first], [11, 12, 13])
        self.assertEqual(first[1], {'preview_id': 12, 'missing': True})
        self.assertEqual({first[0]['model'], first[2]['model']}, {embedding.DEFAULT_MODEL})
        self._assert_vector(first[0], 'a')
        self._assert_vector(first[2], 'b')
        self.assertEqual([e['id'] for e in second], [14])
        self._assert_vector(second[0], 'c')

    def test_idle_wait_asks_again_with_the_model_loaded(self):
        # Empty, then one batch, then empty for good: the worker keeps waiting.
        handler, server = self._serve([[], [_track(1, 11, 'a')]])
        proc = subprocess.Popen(
            [sys.executable, os.path.join(ANALYSER_DIR, 'main.py'), '--skip-sanity-confirmation',
             '--sanity-window', '0', '--loop', '--idle-wait', '0.2'],
            cwd=self.dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            env=dict(os.environ,
                     FOMOPLAYER_API_URL=f'http://127.0.0.1:{server.server_port}/api',
                     FOMOPLAYER_API_KEY='fp_test', SPOTIPY_CLIENT_ID='test', SPOTIPY_CLIENT_SECRET='test',
                     TF_CPP_MIN_LOG_LEVEL='3', PYTHONUNBUFFERED='1',
                     NO_PROXY='127.0.0.1', no_proxy='127.0.0.1'))
        self.addCleanup(proc.stdout.close)
        lines = []
        for line in proc.stdout:
            lines.append(line)
            # Asked again after the batch: it is idling, not exiting.
            if handler.posted and line.startswith('No tracks to process, checking again'):
                break
        still_running = proc.poll() is None
        proc.kill()
        proc.wait()
        output = ''.join(lines)
        self.assertTrue(still_running, output)
        self.assertEqual(output.count('Preparing model'), 1, output)
        self.assertEqual([[e['id'] for e in body] for body in handler.posted], [[11]])

    def test_without_loop_one_batch_is_processed(self):
        handler, server = self._serve([[_track(1, 11, 'a')], [_track(2, 12, 'b')]])
        result = self._run(server)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual([[e['id'] for e in body] for body in handler.posted], [[11]])

    def test_a_failed_batch_report_is_resent_one_entry_at_a_time(self):
        handler, server = self._serve([[_track(1, 11, 'a'), _track(2, 12, 'short')]], fail_batch_reports=True)
        result = self._run(server)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual([len(body) for body in handler.posted], [2, 1, 1])
        self.assertEqual(handler.posted[1][0]['id'], 11)
        self.assertEqual(handler.posted[2], [{'preview_id': 12, 'missing': True}])


if __name__ == '__main__':
    unittest.main()
