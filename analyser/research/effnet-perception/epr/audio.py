"""Decoding and writing audio. 16 kHz mono goes through essentia's MonoLoader/EasyLoader exactly like the analyser
(downmix (L+R)/2, resampleQuality 4), so the numbers are comparable with production embeddings."""
import subprocess

import numpy as np
import soundfile as sf

from .config import SR

HQ_SR = 44100


def load_mono16k(path, start=None, end=None):
    import essentia.standard as es
    if start is None and end is None:
        return es.MonoLoader(filename=str(path), sampleRate=SR, resampleQuality=4)()
    return es.EasyLoader(filename=str(path), sampleRate=SR, resampleQuality=4, downmix='mix',
                         startTime=float(start or 0), endTime=float(end if end is not None else 1e9),
                         replayGain=0, normalize=False)()


def load_stereo(path, start=None, end=None, sr=HQ_SR):
    """Float32 (n, 2) at sr via ffmpeg; mono sources are duplicated to both channels."""
    cmd = ['ffmpeg', '-v', 'error', '-nostdin']
    if start is not None:
        cmd += ['-ss', f'{start:.6f}']
    cmd += ['-i', str(path)]
    if end is not None:
        cmd += ['-t', f'{end - (start or 0):.6f}']
    cmd += ['-map', '0:a:0', '-f', 'f32le', '-ar', str(sr), '-ac', '2', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def write_wav(path, x, sr=HQ_SR):
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), np.asarray(x, dtype=np.float32), sr, subtype='FLOAT')
    return path


def read_wav(path, start=None, stop=None):
    """Float32 (n, channels); start/stop in frames read only that part of the file."""
    x, sr = sf.read(str(path), dtype='float32', always_2d=True, start=start or 0, stop=stop)
    return x, sr


def to_mono16k(x, sr):
    """(L+R)/2 then essentia's resampler at quality 4, matching MonoLoader."""
    import essentia.standard as es
    mono = x.mean(axis=1) if x.ndim == 2 else x
    if sr == SR:
        return mono.astype(np.float32)
    return es.Resample(inputSampleRate=sr, outputSampleRate=SR, quality=4)(mono.astype(np.float32))


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(np.square(x))) + 1e-12)
