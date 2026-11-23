"""Tests for embedding.py.

Covers the sample-embedding spec: vectors come from the shared
`track_embedding` package and conform to `track-embedding/1`. The conformance
fixtures (fixtures/track-embedding-1) hold synthetic audio in every format the
specification lists and reference vectors made by the analyser's former
Essentia pipeline, so passing them means new vectors stay comparable with the
stored ones. Other fixtures are generated with ffmpeg into a fresh temporary
directory per test.

The model is read from TRACK_EMBEDDING_MODELS_DIR, or downloaded into
analyser/models on first use.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np

try:
    import embedding
    from audio_decode import AudioDecodeError
except ImportError:  # track-embedding not installed
    embedding = None

ANALYSER_DIR = os.path.dirname(os.path.abspath(__file__))
FIXTURES_DIR = os.path.join(ANALYSER_DIR, 'fixtures', 'track-embedding-1')
CONFORMANCE = 0.99999  # the specification's tolerance


def _generate(path, source, *args):
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', source,
                    *args, path], check=True)


def _cosine(a, b):
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    return float(a @ b / np.linalg.norm(a) / np.linalg.norm(b))


@unittest.skipIf(embedding is None, 'track-embedding is not installed')
@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg is not installed')
class EmbeddingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = embedding.build_model()

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='embedding_test_')
        self.addCleanup(shutil.rmtree, self.dir)

    def path(self, name):
        return os.path.join(self.dir, name)

    def test_conformance_fixtures_match_their_reference_vectors(self):
        with open(os.path.join(FIXTURES_DIR, 'fixtures.json')) as f:
            listing = json.load(f)
        self.assertEqual(listing['version'], 'track-embedding/1')
        # Every listed format, plus audio just over one patch and audio whose last patch ends on the last frame.
        self.assertEqual(len(listing['fixtures']), 6)
        self.assertIn('wav-16000-mono-190-frames.wav', [f['audio'] for f in listing['fixtures']])
        for fixture in listing['fixtures']:
            with self.subTest(fixture['audio']):
                audio = os.path.join(FIXTURES_DIR, fixture['audio'])
                with open(audio, 'rb') as f:
                    self.assertEqual(hashlib.sha256(f.read()).hexdigest(), fixture['audio_sha256'])
                vector = embedding.embed_file(audio, self.model)
                reference = np.load(os.path.join(FIXTURES_DIR, fixture['reference']))
                self.assertEqual(len(vector), 1280)
                self.assertGreaterEqual(_cosine(vector, reference), CONFORMANCE)

    def test_stored_type_is_version_1_of_the_specification(self):
        self.assertEqual(embedding.EMBEDDING_VERSIONS,
                         {'discogs_multi_embeddings-effnet-bs64-1': 'track-embedding/1'})
        self.assertEqual(embedding.DEFAULT_MODEL, 'discogs_multi_embeddings-effnet-bs64-1')

    def test_vector_is_1280_plain_floats(self):
        mp3 = self.path('noise.mp3')
        _generate(mp3, 'anoisesrc=d=10:c=pink,aformat=channel_layouts=stereo', '-ar', '44100', '-b:a', '160k')
        vector = embedding.embed_file(mp3, self.model)
        self.assertEqual(len(vector), 1280)
        self.assertTrue(all(type(x) is float for x in vector))
        json.dumps(vector)  # reported to the back end as JSON

    def test_too_short_returns_none(self):
        mp3 = self.path('short.mp3')
        _generate(mp3, 'sine=f=330:d=1')
        self.assertIsNone(embedding.embed_file(mp3, self.model))
        self.assertEqual(sorted(os.listdir(self.dir)), ['short.mp3'])

    def test_undecodable_file_raises_decode_error(self):
        path = self.path('not-audio.mp3')
        with open(path, 'wb') as f:
            f.write(b'not audio at all')
        with self.assertRaises(AudioDecodeError) as raised:
            embedding.embed_file(path, self.model)
        self.assertIn('could not decode', str(raised.exception))

    def test_unknown_model_is_refused(self):
        with self.assertRaises(ValueError):
            embedding.build_model('discogs_artist_embeddings-effnet-bs64-1')


@unittest.skipIf(embedding is None, 'track-embedding is not installed')
class EnsureModelsTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='embedding_models_test_')
        self.addCleanup(shutil.rmtree, self.dir)

    def test_missing_model_is_downloaded_once(self):
        with mock.patch.object(embedding.track_embedding, 'download_models') as download:
            embedding.ensure_models(self.dir)
        download.assert_called_once_with(self.dir, licence_accepted=True)

    def test_present_model_is_not_downloaded(self):
        open(os.path.join(self.dir, embedding.MODEL_FILE), 'wb').close()
        with mock.patch.object(embedding.track_embedding, 'download_models') as download:
            embedding.ensure_models(self.dir)
        download.assert_not_called()


@unittest.skipIf(embedding is None, 'track-embedding is not installed')
@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg is not installed')
class NoEssentiaTest(unittest.TestCase):
    """The analyser must not depend on Essentia or TensorFlow: version 1 is
    computed by the shared package, and the old stack pinned the analyser to
    an unmaintained TensorFlow build."""

    def test_embedding_loads_neither_essentia_nor_tensorflow(self):
        fixture = os.path.join(FIXTURES_DIR, 'mp3-44100-stereo.mp3')
        code = ('import sys, embedding\n'
                f'embedding.embed_file({fixture!r}, embedding.build_model())\n'
                "print(sorted(m for m in sys.modules if m.split('.')[0] in ('essentia', 'tensorflow')))\n")
        result = subprocess.run([sys.executable, '-c', code], cwd=ANALYSER_DIR, capture_output=True, text=True,
                                timeout=300)
        self.assertEqual(result.returncode, 0, result.stderr[-2000:])
        self.assertEqual(result.stdout.strip().splitlines()[-1], '[]')

    def test_requirements_do_not_name_essentia_or_tensorflow(self):
        for name in ('requirements.txt', 'requirements-service.txt'):
            with open(os.path.join(ANALYSER_DIR, name)) as f:
                lines = [line.split('#')[0].strip().lower() for line in f]
            with self.subTest(name):
                self.assertFalse([line for line in lines if 'essentia' in line or 'tensorflow' in line])
                self.assertTrue(any(line.startswith('track-embedding @ git+') for line in lines))


if __name__ == '__main__':
    unittest.main()
