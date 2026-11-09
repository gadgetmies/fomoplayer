"""Demucs htdemucs stems for the stems sample, and their per-patch embeddings.

Only a region is separated: the Part 2 unit of the track with a margin on both sides (REGION_MARGIN). Separating
whole tracks took ~6 minutes per track on the shared machine; the swaps, offsets and stem changes only use the unit.
The region's start is stored in OUT/stems/<track_id>/region.json, and read() maps absolute track times onto it.

Demucs runs in a venv that has torch (DEMUCS_PYTHON, default the dj-automation venv), one track at a time on MPS.
Stems are float32 44.1 kHz stereo WAVs under OUT/stems/<track_id>/<stem>.wav; embeddings of each stem over the unit
under OUT/stems/patches/<track_id>-<stem>.npy.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

import numpy as np

from . import audio, embed, sample
from .config import out_path
from .steps import Step

STEP = 'stems'
STEMS = ('drums', 'bass', 'other', 'vocals')
DEMUCS_PYTHON = os.environ.get(
    'DEMUCS_PYTHON', str(Path.home() / 'Documents/Projects/Code/dj-automation/.venv/bin/python'))


def stem_path(track_id, stem):
    return out_path(STEP, str(track_id), f'{stem}.wav')


def patches_path(track_id, stem):
    return out_path(STEP, 'patches', f'{track_id}-{stem}.npy')


def load_patches(track_id, stem):
    return np.load(patches_path(track_id, stem))


REGION_MARGIN = 6.0


def _region(track_id):
    return json.loads(out_path(STEP, str(track_id), 'region.json').read_text())


def region_start(track_id):
    return _region(track_id)['start']


def gain(track_id, track_path=None):
    """One gain for all four stems so that their sum matches the original's level over the region (least squares).
    htdemucs' stems summed up to 15 % quieter than the mix on loud masters, with the balance between them intact;
    the gain removes the level mismatch without touching the balance. Computed once and stored in region.json."""
    r = _region(track_id)
    if 'gain' not in r:
        if track_path is None:
            from . import sample
            track_path = next(t['track_path'] for t in sample.read('stems') if t['track_id'] == track_id)
        n = int(round((r['end'] - r['start']) * audio.HQ_SR))
        mix = sum(audio.read_wav(stem_path(track_id, s), 0, n)[0] for s in STEMS).mean(axis=1)
        orig = audio.load_stereo(track_path, r['start'], r['end']).mean(axis=1)
        k = min(len(mix), len(orig))
        r['gain'] = float(np.dot(orig[:k], mix[:k]) / (np.dot(mix[:k], mix[:k]) + 1e-12))
        out_path(STEP, str(track_id), 'region.json').write_text(json.dumps(r))
    return r['gain']


def read(track_id, stem, start, end):
    """Stem audio between absolute track times start and end (seconds), level-corrected by gain()."""
    off = region_start(track_id)
    if start < off - 1e-6:
        raise ValueError(f'{start} is before the separated region ({off})')
    x, sr = audio.read_wav(stem_path(track_id, stem), int(round((start - off) * audio.HQ_SR)),
                           int(round((end - off) * audio.HQ_SR)))
    return x * gain(track_id)


def available(track_id):
    return all(stem_path(track_id, s).exists() for s in STEMS)


def separate(t, start, end):
    tid = t['track_id']
    if available(tid):
        return 'cached'
    work = out_path(STEP, 'work', str(tid), 'x').parent
    cut = work / 'region.wav'
    audio.write_wav(cut, audio.load_stereo(t['track_path'], start, end))
    cmd = [DEMUCS_PYTHON, '-m', 'demucs', '-n', 'htdemucs', '-d', os.environ.get('DEMUCS_DEVICE', 'mps'),
           # float32: the default int16 output rescales every stem that would clip, each on its own, which changes
           # the balance of the stems and made their sum 0.6-1.2 dB quieter than the mix on loud masters.
           '--float32', '-o', str(work / 'out'), '--filename', '{stem}.{ext}', str(cut)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'demucs failed: {r.stderr[-1500:]}')
    for s in STEMS:
        found = list((work / 'out').rglob(f'{s}.wav'))
        if not found:
            raise RuntimeError(f'demucs wrote no {s}.wav')
        shutil.move(str(found[0]), stem_path(tid, s))
    out_path(STEP, str(tid), 'region.json').write_text(json.dumps({'start': start, 'end': end}))
    shutil.rmtree(work, ignore_errors=True)
    return 'demucs'


def run(limit=None):
    from .changes import unit_window
    tracks = sample.read('stems')[:limit] if limit else sample.read('stems')
    step = Step(STEP)

    def work(t):
        us, ue = unit_window(t)
        source = separate(t, max(0.0, us - REGION_MARGIN), min(t['duration'], ue + REGION_MARGIN))
        rows = []
        for s in STEMS:
            x = read(t['track_id'], s, us, ue)
            p = embed.patches(audio.to_mono16k(x, audio.HQ_SR))
            np.save(patches_path(t['track_id'], s), p.astype(np.float32))
            rows.append({'track_id': t['track_id'], 'stem': s, 'source': source, 'patches': p.shape[0],
                         'rms_db': round(float(audio.rms_db(x)), 2)})
        return rows

    # Sequential: one Demucs process at a time on the GPU.
    step.run(tracks, work, key=lambda t: t['track_id'], workers=1)
    return step.summary()
