"""Part 2: audio changes on the unit chosen in Part 1, measured against the original unit.

reference  - the original unit of every Part 1 track, embedded from the cut audio (the reference set)
changes    - every change in transforms.catalogue() on the Part 2 sample, plus stem removal/solo on the stems sample

Per changed item: cosine distance to its original; the normalised shift (that distance over the original's distance
to its own 10th nearest neighbour in the reference set); and self-retrieval (the original is the changed item's
nearest neighbour among the reference set).
"""
import json

import numpy as np

from . import audio, embed, representations, sample, stems, transforms
from .config import SEED, out_path
from .steps import Step

PAGE_TRACKS = 6  # tracks whose changed audio is kept for the listening page


def unit_window(t):
    """(start, end) seconds of the Part 2 unit for a track."""
    u = representations.unit()
    if u['unit'] == 'full':
        return 0.0, t['duration']
    starts = json.loads(out_path('representations', 'section-starts', f"{u['seconds']}s-{u['method']}.json")
                        .read_text())
    start = float(starts[str(t['track_id'])])
    return start, min(start + u['seconds'], t['duration'])


def means_path(step, track_id):
    return out_path(step, 'means', f'{track_id}.npz')


def _reference_work(t):
    s, e = unit_window(t)
    x = audio.load_stereo(t['track_path'], s, e)
    p = embed.patches(audio.to_mono16k(x, audio.HQ_SR))
    np.save(out_path('reference', 'means', f"{t['track_id']}.npy"), p.mean(0).astype(np.float32))
    return [{'track_id': t['track_id'], 'start': round(s, 2), 'end': round(e, 2), 'patches': p.shape[0]}]


def _ctx(t, start):
    first = t.get('first_beat_ms')
    return {'seed': SEED + int(t['track_id']), 'grid_bpm': t.get('grid_bpm'),
            # the first beat relative to the cut section
            'first_beat_s': None if first is None else (first / 1000.0 - start)}


def _embed_mean(y):
    return embed.patches(audio.to_mono16k(y, audio.HQ_SR)).mean(0)


def _keep_audio(t, name, y, keep):
    if keep:
        audio.write_wav(out_path('page-audio', 'changes', str(t['track_id']), f'{name}.wav'), y)


def _changes_work(item):
    t, keep = item
    s, e = unit_window(t)
    x = audio.load_stereo(t['track_path'], s, e)
    ctx_base = _ctx(t, s)
    means, rows = {}, []
    for group, name, (gen, verify) in transforms.catalogue():
        ctx = dict(ctx_base)
        try:
            y = gen(x, ctx)
        except transforms.NotApplicable as na:
            rows.append({'track_id': t['track_id'], 'group': group, 'change': name, 'status': f'n/a: {na}'})
            continue
        ok, measured = verify(x, y, ctx)
        if not ok:
            rows.append({'track_id': t['track_id'], 'group': group, 'change': name, 'status': 'verify-failed',
                         'measured': measured})
            continue
        means[name] = _embed_mean(y)
        _keep_audio(t, name, y, keep)
        rows.append({'track_id': t['track_id'], 'group': group, 'change': name, 'status': 'ok', 'measured': measured})
    np.savez(means_path('changes', t['track_id']), **means)
    return rows


def _stem_work(item):
    t, keep = item
    s, e = unit_window(t)
    parts = {}
    for st in stems.STEMS:
        parts[st] = stems.read(t['track_id'], st, s, e)
    n = min(len(v) for v in parts.values())
    parts = {k: v[:n] for k, v in parts.items()}
    total = sum(parts.values())
    means, rows = {}, []
    variants = {'stem-sum': total}
    for st in stems.STEMS:
        variants[f'without-{st}'] = total - parts[st]
        variants[f'only-{st}'] = parts[st]
    for name, y in variants.items():
        if np.sqrt(np.mean(y ** 2)) < 1e-4:
            rows.append({'track_id': t['track_id'], 'group': 'stems', 'change': name, 'status': 'n/a: silent'})
            continue
        means[name] = _embed_mean(y)
        _keep_audio(t, name, y, keep)
        rows.append({'track_id': t['track_id'], 'group': 'stems', 'change': name, 'status': 'ok',
                     'measured': round(float(audio.rms_db(y)), 2)})
    np.savez(means_path('changes-stems', t['track_id']), **means)
    return rows


def run(workers=3, limit=None):
    part1 = sample.read('part1')
    ref = Step('reference')
    ref.run(part1, _reference_work, key=lambda t: t['track_id'], workers=workers)
    code = ref.summary(unit=representations.unit())

    part2 = sample.read('part2')[:limit] if limit else sample.read('part2')
    ch = Step('changes')
    ch.run([(t, i < PAGE_TRACKS) for i, t in enumerate(part2)], _changes_work, key=lambda it: it[0]['track_id'],
           workers=workers)
    code |= ch.summary()

    st_tracks = [t for t in sample.read('stems') if stems.available(t['track_id'])]
    st_tracks = st_tracks[:limit] if limit else st_tracks
    sst = Step('changes-stems')
    sst.run([(t, i < PAGE_TRACKS) for i, t in enumerate(st_tracks)], _stem_work, key=lambda it: it[0]['track_id'],
            workers=workers)
    code |= sst.summary()
    measure()
    return code


def reference_set():
    ids, vecs = [], []
    for t in sample.read('part1'):
        p = out_path('reference', 'means', f"{t['track_id']}.npy")
        if p.exists():
            ids.append(t['track_id'])
            vecs.append(np.load(p))
    return np.array(ids), embed.unit(np.array(vecs))


def measure():
    """Distances, normalised shifts and self-retrieval for every changed item -> OUT/changes/measures.csv."""
    ids, ref = reference_set()
    pos = {int(i): j for j, i in enumerate(ids)}
    d = 1 - ref @ ref.T
    np.fill_diagonal(d, np.inf)
    tenth = np.sort(d, axis=1)[:, 9]
    rows = []
    for step in ('changes', 'changes-stems'):
        for p in sorted(out_path(step, 'means', 'x').parent.glob('*.npz')):
            tid = int(p.stem)
            if tid not in pos:
                continue
            z = np.load(p)
            j = pos[tid]
            orig = ref[j]
            base = embed.unit(z['stem-sum']) if 'stem-sum' in z.files else orig
            for name in z.files:
                v = embed.unit(z[name])
                dist = 1 - float(v @ orig)
                sims = ref @ v
                rows.append({'track_id': tid, 'step': step, 'change': name, 'cos_dist': round(dist, 6),
                             'shift': round(dist / tenth[j], 4), 'self_retrieved': int(np.argmax(sims) == j),
                             'dist_to_stem_sum': round(1 - float(v @ base), 6) if step == 'changes-stems' else ''})
    out = out_path('changes', 'measures.csv')
    out.unlink(missing_ok=True)
    Step._append(out, rows)
    return out
