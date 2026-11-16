"""Decode audio files to WAV with ffmpeg.

Replaces pydub, whose `audioop` import fails on Python 3.13. Every analyser
worker only used pydub to turn a downloaded preview or sample into a 16-bit
PCM WAV for Essentia, Panako or the waveform renderer; this does the same
with one ffmpeg call. The source sample rate and channel count are kept, as
pydub kept them, so embeddings and fingerprints stay comparable with stored
ones (see test_audio_decode.py for the sample-identical comparison).
"""

import os
import subprocess
import wave


class AudioDecodeError(RuntimeError):
    pass


def wav_duration_seconds(path):
    """Length of a PCM WAV file in seconds, read from its header."""
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def to_wav(src, dst, max_seconds=None):
    """Decode `src` (any format ffmpeg reads) to a 16-bit PCM WAV at `dst`.

    `max_seconds` caps the decoded length (ffmpeg `-t`), e.g. for full-length
    Bandcamp streams. Returns `dst`; raises AudioDecodeError with ffmpeg's
    message when decoding fails or produces an empty file.
    """
    command = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
               '-i', src, '-vn', '-acodec', 'pcm_s16le']
    if max_seconds is not None:
        command += ['-t', str(max_seconds)]
    command += ['-f', 'wav', dst]

    result = subprocess.run(command, capture_output=True)
    if result.returncode != 0:
        message = result.stderr.decode(errors='replace').strip()
        raise AudioDecodeError(f"ffmpeg could not decode {src}: {message}")
    if not os.path.exists(dst) or os.path.getsize(dst) == 0:
        raise AudioDecodeError(f"ffmpeg produced no audio for {src}")
    return dst
