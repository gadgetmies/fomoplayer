"""HTTP service that turns audio into a Discogs-EffNet embedding.

Runs next to the backend on a private network. The backend's
`embedNotificationAudioSamples` job POSTs each pending sample's audio here and
stores the returned vector; this service holds no Fomo Player credentials and
never calls the backend.

  GET  /health  -> 200 {"status": "ok", "model": ...}
  POST /embed   -> 200 {"model": ..., "embedding": [1280 floats]}
                   body: raw audio; Content-Type names the format
                   401 without `Authorization: Bearer <EMBEDDING_SERVICE_TOKEN>`
                   413 body over EMBEDDING_SERVICE_MAX_BYTES
                   422 {"error": ...} audio that cannot be decoded or is too short

Environment: EMBEDDING_SERVICE_TOKEN (required), PORT (default 8080),
EMBEDDING_SERVICE_MAX_BYTES (default 100 MB).
"""

import hmac
import json
import os
import socket
import sys
import tempfile
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import essentia

from audio_decode import AudioDecodeError
import embedding

WAV_TYPES = {'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'}
DEFAULT_MAX_BYTES = 100 * 1024 * 1024


def _suffix(content_type):
    """`.wav` uploads are embedded as-is (as main.py does); everything else is
    decoded by ffmpeg, which detects the format from the content."""
    media_type = (content_type or '').split(';')[0].strip().lower()
    return '.wav' if media_type in WAV_TYPES else '.audio'


class DualStackHTTPServer(ThreadingHTTPServer):
    """Listens on IPv6 and IPv4 at once. Railway's legacy environments resolve
    private DNS names (embedding.railway.internal) to IPv6 only, while its health
    check connects over IPv4."""

    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


def _listen(address, handler):
    """Dual-stack on `::` when `host` is None, falling back to IPv4 on hosts
    without IPv6; an explicit host is used as given."""
    host, port = address
    if host is not None:
        return ThreadingHTTPServer((host, port), handler)
    try:
        return DualStackHTTPServer(('::', port), handler)
    except OSError as error:
        print(f'[embedding-service] IPv6 unavailable ({error}), listening on IPv4 only', flush=True)
        return ThreadingHTTPServer(('0.0.0.0', port), handler)


def create_server(token, model, port=0, host=None, max_bytes=DEFAULT_MAX_BYTES):
    if not token:
        raise ValueError('EMBEDDING_SERVICE_TOKEN must be set')
    expected = f'Bearer {token}'.encode()
    inference_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            # stdout: Railway marks every stderr line as an error. Embedding failures keep their tracebacks on stderr.
            print(f'[embedding-service] {self.address_string()} {fmt % args}', flush=True)

        def _json(self, status, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == '/health':
                self._json(200, {'status': 'ok', 'model': embedding.DEFAULT_MODEL})
            else:
                self._json(404, {'error': 'not found'})

        def do_POST(self):
            if self.path != '/embed':
                return self._json(404, {'error': 'not found'})
            given = (self.headers.get('Authorization') or '').encode()
            if not hmac.compare_digest(given, expected):
                return self._json(401, {'error': 'unauthorized'})
            length = int(self.headers.get('Content-Length') or 0)
            if length <= 0:
                return self._json(422, {'error': 'empty body'})
            if length > max_bytes:
                # Drain in bounded chunks so the client reads the 413 instead of a broken pipe.
                remaining = length
                while remaining > 0:
                    chunk = self.rfile.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                return self._json(413, {'error': f'body over {max_bytes} bytes'})

            with tempfile.TemporaryDirectory(prefix='embed_') as work_dir:
                path = os.path.join(work_dir, 'input' + _suffix(self.headers.get('Content-Type')))
                with open(path, 'wb') as f:
                    f.write(self.rfile.read(length))
                try:
                    with inference_lock:
                        vector = embedding.embed_file(path, model, work_dir)
                except AudioDecodeError as e:
                    return self._json(422, {'error': str(e)})
                except Exception as e:  # Essentia raises RuntimeError on unreadable WAVs
                    traceback.print_exc()
                    return self._json(422, {'error': f'could not embed audio: {e}'})
            if vector is None:
                return self._json(422, {'error': 'audio too short to embed'})
            self._json(200, {'model': embedding.DEFAULT_MODEL, 'embedding': vector})

    return _listen((host, port), Handler)


def quiet_essentia_warnings():
    """Each embedding makes Essentia warn 'No network created, or last created
    network has been deleted...' about 2,000 times, which overruns Railway's log
    rate limit and drops other lines. Its errors stay on."""
    essentia.log.warningActive = False


def main():
    quiet_essentia_warnings()
    token = os.environ.get('EMBEDDING_SERVICE_TOKEN')
    if not token:
        sys.exit('EMBEDDING_SERVICE_TOKEN is not set; refusing to start without it')
    port = int(os.environ.get('PORT', '8080'))
    max_bytes = int(os.environ.get('EMBEDDING_SERVICE_MAX_BYTES', DEFAULT_MAX_BYTES))
    print(f'[embedding-service] loading model {embedding.DEFAULT_MODEL}', flush=True)
    model = embedding.build_model()
    server = create_server(token, model, port=port, max_bytes=max_bytes)
    print(f'[embedding-service] listening on {server.server_address[0]} port {server.server_port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
