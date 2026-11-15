"""Tests for embedding.py.

The parity test reproduces the inline steps main.py used before the shared
module existed and requires the module to give the same vector, so stored
preview and sample embeddings stay comparable with new ones. Fixtures are
generated with ffmpeg into a fresh temporary directory per test.
"""

import os
import shutil
import subprocess
import tempfile
import unittest

import numpy as np

try:
    from essentia.standard import MonoLoader, TensorflowPredictEffnetDiscogs
    import embedding
except ImportError:  # essentia-tensorflow not installed
    embedding = None


def _generate(path, source, *args):
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', source,
                    *args, path], check=True)


def _cosine(a, b):
    a, b = np.asarray(a), np.asarray(b)
    return float(a @ b / np.linalg.norm(a) / np.linalg.norm(b))


@unittest.skipIf(embedding is None, 'essentia-tensorflow is not installed')
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

    def legacy_vector(self, wav_path):
        """The steps main.py ran inline before embedding.py."""
        model = TensorflowPredictEffnetDiscogs(
            graphFilename=os.path.join(embedding.MODELS_DIR, f"{embedding.DEFAULT_MODEL}.pb"),
            output="PartitionedCall:1")
        audio = MonoLoader(filename=wav_path, sampleRate=16000, resampleQuality=4)()
        return model(audio).T.mean(1).tolist()

    def test_mp3_matches_legacy_steps(self):
        mp3 = self.path('noise.mp3')
        _generate(mp3, 'anoisesrc=d=10:c=pink,aformat=channel_layouts=stereo', '-ar', '44100', '-b:a', '160k')
        legacy_wav = embedding.to_wav(mp3, self.path('legacy.wav'))
        vector = embedding.embed_file(mp3, self.model, self.dir)
        self.assertEqual(len(vector), 1280)
        self.assertGreaterEqual(_cosine(vector, self.legacy_vector(legacy_wav)), 0.9999)

    def test_wav_is_read_as_is(self):
        wav = self.path('tone.wav')
        _generate(wav, 'sine=f=220:d=8', '-ar', '48000', '-c:a', 'pcm_s24le')
        vector = embedding.embed_file(wav, self.model, self.dir)
        self.assertGreaterEqual(_cosine(vector, self.legacy_vector(wav)), 0.9999)
        self.assertEqual(sorted(os.listdir(self.dir)), ['tone.wav'])

    def test_too_short_returns_none(self):
        mp3 = self.path('short.mp3')
        _generate(mp3, 'sine=f=330:d=1')
        self.assertIsNone(embedding.embed_file(mp3, self.model, self.dir))
        self.assertEqual(sorted(os.listdir(self.dir)), ['short.mp3'])


if __name__ == '__main__':
    unittest.main()
