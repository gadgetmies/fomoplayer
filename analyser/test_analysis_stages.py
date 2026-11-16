import os
import shutil
import subprocess
import wave

import pytest

import analysis_stages
from audio_decode import to_wav

pytestmark = pytest.mark.skipif(not shutil.which('ffmpeg'), reason='ffmpeg is not installed')


@pytest.fixture
def mp3(tmp_path):
    path = tmp_path / 'source.mp3'
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
                    'anoisesrc=d=5:c=pink:seed=3', '-ac', '2', '-ar', '44100', str(path)], check=True)
    return path


def _frames(path):
    with wave.open(str(path), 'rb') as w:
        return w.getparams()[:3], w.getnframes(), w.readframes(w.getnframes())


def test_capped_wav_equals_a_capped_decode(tmp_path, mp3):
    # The combined worker decodes once, in full, and caps for fingerprinting;
    # the fingerprint worker decoded with ffmpeg -t. Same samples either way.
    full = to_wav(str(mp3), str(tmp_path / 'full.wav'))
    capped = analysis_stages.capped_wav(full, str(tmp_path / 'capped.wav'), 2)
    decoded = to_wav(str(mp3), str(tmp_path / 'decoded.wav'), max_seconds=2)
    assert capped == str(tmp_path / 'capped.wav')
    assert _frames(capped) == _frames(decoded)


def test_capped_wav_keeps_a_short_file(tmp_path, mp3):
    full = to_wav(str(mp3), str(tmp_path / 'full.wav'))
    assert analysis_stages.capped_wav(full, str(tmp_path / 'capped.wav'), 900) == full
    assert not os.path.exists(tmp_path / 'capped.wav')
