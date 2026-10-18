"""Stem swaps: does a mashup land nearer the host or the donor of the swapped layer?

position = d(mashup, host) / (d(mashup, host) + d(mashup, donor)): 0 = sounds like the host, 1 = like the donor.
host = the host's stem sum over the region; donor = the donor's stem sum stretched to the host tempo.
"""
import random

import numpy as np

from . import audio, changes, embed, mashup, sample, stems
from .config import SEED, out_path
from .steps import Step

STEP = 'swaps'
N_PAIRS = 200
MAX_BPM_DIFF = 0.15
PAGE_PAIRS = 6


def pairs(tracks, n=N_PAIRS, seed=SEED):
    rng = random.Random(seed)
    tracks = sorted(tracks, key=lambda t: t['track_id'])
    out, seen = [], set()
    attempts = 0
    while len(out) < n and attempts < n * 50:
        attempts += 1
        h, d = rng.sample(tracks, 2)
        folded = mashup.fold_bpm(d['grid_bpm'], h['grid_bpm'])
        if abs(folded / h['grid_bpm'] - 1) > MAX_BPM_DIFF or (h['track_id'], d['track_id']) in seen:
            continue
        seen.add((h['track_id'], d['track_id']))
        out.append((h, d))
    return out


def _mean(y):
    return embed.patches(audio.to_mono16k(y, audio.HQ_SR)).mean(0)


def _work(item):
    (host, donor), keep = item
    us, ue = changes.unit_window(host)
    start, bars = mashup.region(host, us, ue - us)
    rows = []
    host_v = None
    for layer in mashup.LAYERS:
        m, h, d, info = mashup.swap(host, start, bars, donor, layer)
        if host_v is None:
            host_v = _mean(h)
        mv, dv = _mean(m), _mean(d)
        dh, dd = embed.cos_dist(mv, host_v), embed.cos_dist(mv, dv)
        rows.append({'host_id': host['track_id'], 'donor_id': donor['track_id'], 'layer': layer,
                     'host_bpm': host['grid_bpm'], 'donor_bpm': donor['grid_bpm'], 'bars': bars,
                     'd_mashup_host': round(dh, 6), 'd_mashup_donor': round(dd, 6),
                     'd_host_donor': round(embed.cos_dist(host_v, dv), 6),
                     'position': round(dh / (dh + dd + 1e-12), 4), **info})
        if keep:
            base = out_path('page-audio', 'swaps', f"{host['track_id']}-{donor['track_id']}")
            audio.write_wav(base / f'mashup-{layer}.wav', m)
            audio.write_wav(base / 'host.wav', h)
            audio.write_wav(base / f'donor-{layer}.wav', d)
    return rows


def run(workers=3, limit=None):
    tracks = [t for t in sample.read('stems') if stems.available(t['track_id'])]
    ps = pairs(tracks)[:limit] if limit else pairs(tracks)
    step = Step(STEP)
    step.run([(p, i < PAGE_PAIRS) for i, p in enumerate(ps)], _work,
             key=lambda it: f"{it[0][0]['track_id']}-{it[0][1]['track_id']}", workers=workers)
    return step.summary(pairs=len(ps), stem_tracks=len(tracks))
