"""Stem offsets: does shifting one layer in time move the embedding?

separation loss = d(original mix, unshifted stem sum) over the region.
offset shift   = d(unshifted stem sum, stem sum with one layer shifted), measured against the unshifted sum, not
                 the original, so separation artefacts are not counted as an offset effect.
"""
import numpy as np

from . import audio, changes, embed, mashup, sample, stems
from .steps import Step
from .config import out_path

STEP = 'offsets'
N_TRACKS = 50
PAGE_TRACKS = 4


def _mean(y):
    return embed.patches(audio.to_mono16k(y, audio.HQ_SR)).mean(0)


def _work(item):
    t, keep = item
    us, ue = changes.unit_window(t)
    start, bars = mashup.region(t, us, ue - us)
    end = start + bars * mashup.bar_seconds(t['grid_bpm'])
    parts = mashup.load_stems(t['track_id'], start, end)
    unshifted = sum(parts.values())
    original = audio.load_stereo(t['track_path'], start, end)
    n = min(len(original), len(unshifted))
    u = _mean(unshifted[:n])
    loss = embed.cos_dist(_mean(original[:n]), u)
    resid = 10 * np.log10(np.mean((original[:n] - unshifted[:n]) ** 2) / (np.mean(original[:n] ** 2) + 1e-20) + 1e-20)
    rows = [{'track_id': t['track_id'], 'layer': '', 'offset': 'separation-loss', 'samples': 0,
             'd_to_unshifted': round(loss, 6), 'residual_db': round(float(resid), 2)}]
    for layer in mashup.LAYERS:
        for kind in mashup.OFFSETS:
            k = mashup.offset_samples(t['grid_bpm'], kind)
            y = mashup.shifted(parts, layer, k)
            rows.append({'track_id': t['track_id'], 'layer': layer, 'offset': kind, 'samples': k,
                         'd_to_unshifted': round(embed.cos_dist(_mean(y), u), 6), 'residual_db': ''})
            if keep and kind in ('1/16', 'beat'):
                audio.write_wav(out_path('page-audio', 'offsets', str(t['track_id']), f'{layer}-{kind.replace("/", "_")}.wav'), y)
    if keep:
        audio.write_wav(out_path('page-audio', 'offsets', str(t['track_id']), 'unshifted.wav'), unshifted)
    return rows


def run(workers=3, limit=None):
    tracks = [t for t in sample.read('stems') if stems.available(t['track_id'])][:N_TRACKS]
    tracks = tracks[:limit] if limit else tracks
    step = Step(STEP)
    step.run([(t, i < PAGE_TRACKS) for i, t in enumerate(tracks)], _work, key=lambda it: it[0]['track_id'],
             workers=workers)
    return step.summary(tracks=len(tracks))
