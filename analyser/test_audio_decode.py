"""Tests for audio_decode.to_wav.

The pydub comparison proves the helper produces the same samples pydub did,
so stored embeddings and fingerprints stay comparable. It runs only where
pydub is importable (Python <= 3.12, or 3.13 with audioop-lts) and skips
otherwise; the helper-only tests always run.

Fixtures are generated with ffmpeg into a fresh temporary directory per test.
"""

import os
import shutil
import subprocess
import tempfile
import unittest
import wave

from audio_decode import AudioDecodeError, to_wav, wav_duration_seconds

try:
    from pydub import AudioSegment
except ImportError:
    AudioSegment = None


def _generate(path, source, *args):
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', source,
                    *args, path], check=True)


def _read(path):
    with wave.open(path) as w:
        return w.getsampwidth(), w.getframerate(), w.getnchannels(), w.readframes(w.getnframes())


@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg is not installed')
class ToWavTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='audio_decode_test_')
        self.addCleanup(shutil.rmtree, self.dir)
        self.mp3 = os.path.join(self.dir, 'stereo.mp3')
        _generate(self.mp3, 'sine=f=440:d=4,aformat=channel_layouts=stereo', '-ar', '44100', '-b:a', '192k')
        # Beatport serves mp3 data under a .LOFI extension.
        self.lofi = os.path.join(self.dir, 'preview.LOFI')
        _generate(self.lofi, 'anoisesrc=d=3:c=pink', '-ar', '48000', '-ac', '1', '-f', 'mp3')
        self.long_mp3 = os.path.join(self.dir, 'long.mp3')
        _generate(self.long_mp3, 'sine=f=220:d=7', '-ar', '22050')

    def out(self, name):
        return os.path.join(self.dir, name)

    def test_keeps_rate_and_channels_as_16_bit(self):
        width, rate, channels, frames = _read(to_wav(self.mp3, self.out('a.wav')))
        self.assertEqual((width, rate, channels), (2, 44100, 2))
        self.assertGreater(len(frames), 0)

    def test_caps_length(self):
        _, rate, channels, frames = _read(to_wav(self.long_mp3, self.out('capped.wav'), max_seconds=2))
        self.assertEqual(len(frames) // (2 * channels), 2 * rate)

    def test_wav_duration_seconds(self):
        path = to_wav(self.long_mp3, self.out('duration.wav'), max_seconds=3)
        self.assertAlmostEqual(wav_duration_seconds(path), 3.0, places=3)

    def test_undecodable_input_raises_with_ffmpeg_message(self):
        bad = self.out('bad.mp3')
        with open(bad, 'wb') as f:
            f.write(b'not audio')
        with self.assertRaises(AudioDecodeError) as raised:
            to_wav(bad, self.out('bad.wav'))
        self.assertIn('bad.mp3', str(raised.exception))

    @unittest.skipIf(AudioSegment is None, 'pydub is not installed')
    def test_matches_pydub(self):
        cases = [
            ('from_mp3', self.mp3, {}),
            ('from_file', self.mp3, {}),
            ('from_file', self.lofi, {}),
            ('from_file', self.long_mp3, {'duration': 2}),
        ]
        for method, src, kwargs in cases:
            with self.subTest(method=method, src=os.path.basename(src), **kwargs):
                expected = self.out('pydub.wav')
                getattr(AudioSegment, method)(src, **kwargs).export(expected, format='wav').close()
                actual = to_wav(src, self.out('helper.wav'), max_seconds=kwargs.get('duration'))
                self.assertEqual(_read(actual), _read(expected))


if __name__ == '__main__':
    unittest.main()
