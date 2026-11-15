"""Tests for embedding_service.py, against a server started on a free port.

Covers the sample-embedding spec: the service's vector equals the shared
module's (and so the preview path's), and requests without the shared token
are refused without running the model.
"""

import contextlib
import io
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import unittest
from unittest import mock
import urllib.error
import urllib.request

import numpy as np

try:
    import embedding
    import embedding_service
except ImportError:  # essentia-tensorflow not installed
    embedding = None

TOKEN = 'test-token'


def _ipv6_available():
    try:
        with socket.socket(socket.AF_INET6) as s:
            s.bind(('::1', 0))
        return True
    except OSError:
        return False


def _generate(path, source, *args):
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', source,
                    *args, path], check=True)


@unittest.skipIf(embedding is None, 'essentia-tensorflow is not installed')
@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg is not installed')
class EmbeddingServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = embedding.build_model()
        cls.dir = tempfile.mkdtemp(prefix='embedding_service_test_')
        cls.mp3 = os.path.join(cls.dir, 'noise.mp3')
        _generate(cls.mp3, 'anoisesrc=d=10:c=pink', '-ar', '44100')
        cls.wav = os.path.join(cls.dir, 'tone.wav')
        _generate(cls.wav, 'sine=f=220:d=8', '-ar', '48000', '-c:a', 'pcm_s24le')

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir)

    def setUp(self):
        self.server = embedding_service.create_server(TOKEN, self.model, host='127.0.0.1', max_bytes=5_000_000)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f'http://127.0.0.1:{self.server.server_port}'
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(self, method, path, body=None, token=TOKEN, content_type='audio/mpeg'):
        headers = {'Content-Type': content_type}
        if token is not None:
            headers['Authorization'] = f'Bearer {token}'
        req = urllib.request.Request(self.base + path, data=body, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=120) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def read(self, path):
        with open(path, 'rb') as f:
            return f.read()

    def test_health(self):
        self.assertEqual(self.request('GET', '/health', token=None),
                         (200, {'status': 'ok', 'model': embedding.DEFAULT_MODEL}))

    def test_mp3_vector_matches_shared_module(self):
        status, body = self.request('POST', '/embed', self.read(self.mp3))
        self.assertEqual(status, 200, body)
        self.assertEqual(body['model'], embedding.DEFAULT_MODEL)
        self.assertEqual(len(body['embedding']), 1280)
        expected = embedding.embed_file(self.mp3, self.model, tempfile.mkdtemp(dir=self.dir))
        np.testing.assert_allclose(body['embedding'], expected, rtol=0, atol=1e-6)

    def test_wav_is_embedded_as_is(self):
        status, body = self.request('POST', '/embed', self.read(self.wav), content_type='audio/wav')
        self.assertEqual(status, 200, body)
        np.testing.assert_allclose(body['embedding'], embedding.embed_wav(self.wav, self.model), rtol=0, atol=1e-6)

    def test_missing_or_wrong_token_is_401(self):
        for token in (None, 'wrong-token', ''):
            with self.subTest(token=token):
                self.assertEqual(self.request('POST', '/embed', self.read(self.mp3), token=token),
                                 (401, {'error': 'unauthorized'}))

    def test_undecodable_body_is_422(self):
        status, body = self.request('POST', '/embed', b'not audio at all')
        self.assertEqual(status, 422)
        self.assertIn('could not decode', body['error'])

    def test_too_short_is_422(self):
        short = os.path.join(self.dir, 'short.mp3')
        _generate(short, 'sine=f=330:d=1')
        self.assertEqual(self.request('POST', '/embed', self.read(short)),
                         (422, {'error': 'audio too short to embed'}))

    def test_oversized_body_is_413(self):
        status, _ = self.request('POST', '/embed', b'\0' * 5_000_001)
        self.assertEqual(status, 413)

    def test_request_lines_are_logged_to_stdout(self):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.request('GET', '/health', token=None)
        self.assertIn('[embedding-service] 127.0.0.1 "GET /health HTTP/1.1" 200', out.getvalue())
        self.assertEqual(err.getvalue(), '')

    def serve_default(self):
        server = embedding_service.create_server(TOKEN, self.model)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return server

    def health(self, host, port):
        with self.opener.open(f'http://{host}:{port}/health', timeout=30) as res:
            return res.status

    def test_default_listener_answers_on_ipv4(self):
        # Railway's health check connects over IPv4
        self.assertEqual(self.health('127.0.0.1', self.serve_default().server_port), 200)

    @unittest.skipUnless(_ipv6_available(), 'IPv6 is not available on this host')
    def test_default_listener_answers_on_ipv6(self):
        # Railway's legacy private network resolves embedding.railway.internal to IPv6 only
        server = self.serve_default()
        self.assertIsInstance(server, embedding_service.DualStackHTTPServer)
        self.assertEqual(self.health('[::1]', server.server_port), 200)

    def test_falls_back_to_ipv4_without_ipv6(self):
        unsupported = mock.Mock(side_effect=OSError(97, 'Address family not supported by protocol'))
        with mock.patch.object(embedding_service, 'DualStackHTTPServer', unsupported), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            server = self.serve_default()
        self.assertEqual(server.server_address[0], '0.0.0.0')
        self.assertIn('IPv6 unavailable', out.getvalue())
        self.assertEqual(self.health('127.0.0.1', server.server_port), 200)

    def test_refuses_to_start_without_token(self):
        with self.assertRaises(ValueError):
            embedding_service.create_server('', self.model)


if __name__ == '__main__':
    unittest.main()
