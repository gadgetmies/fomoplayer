"""Part 1: track representations built from the full-track patch embeddings, compared with the mean.

Single-vector representations are compared by cosine distance. Multi-vector ones (phrase sections, k-means centres)
by a symmetric Chamfer distance: the mean over A's vectors of the best match in B, averaged both ways; the phrase
sections are also compared by their single best-matching pair ("best section").

Sections are cut from the full-track patch matrix (a run of consecutive patches) rather than by re-embedding the cut
audio: the patches inside a section are the same either way apart from the edges, and it costs nothing.
"""
import json
import math

import numpy as np
from scipy.stats import spearmanr

from . import attributes, embed, fullembed, sample
from .config import PATCH_HOP_SECONDS, PATCH_SECONDS, SEED, out_path
from .steps import Step

STEP = 'representations'
K_NN = 10
SECTION_SECONDS = (30, 60)
SECTION_METHODS = ('fixed', 'loudest', 'typical')  # simplest first: the unit choice prefers earlier ones
UNIT_MIN_OVERLAP = 7.0


def patches_for(seconds):
    return int(math.ceil((seconds - PATCH_SECONDS) / PATCH_HOP_SECONDS)) + 1


# ---------- loudness per patch (for the loudest section) ----------

def _loudness_path(track_id):
    return out_path('loudness', 'patches', f'{track_id}.npy')


def _loudness_work(t):
    from . import audio
    x = audio.load_mono16k(t['track_path'])
    n = fullembed.load(t['track_id']).shape[0]
    hop, size = int(round(PATCH_HOP_SECONDS * 16000)), int(round(PATCH_SECONDS * 16000))
    rms = np.array([np.sqrt(np.mean(np.square(x[i * hop:i * hop + size])) + 1e-12) for i in range(n)])
    np.save(_loudness_path(t['track_id']), rms.astype(np.float32))
    return [{'track_id': t['track_id']}]


# ---------- builders ----------

def window_mean(p, start, k):
    return p[start:start + k].mean(axis=0)


def section_start(p, method, k, duration, loud=None):
    n = p.shape[0]
    if n <= k:
        return 0
    if method == 'fixed':
        return min(int(round((duration / 3) / PATCH_HOP_SECONDS)), n - k)
    if method == 'loudest':
        c = np.convolve(loud[:n], np.ones(k), 'valid')
        return int(np.argmax(c))
    if method == 'typical':
        m = embed.unit(p.mean(axis=0))
        c = np.cumsum(np.vstack([np.zeros((1, p.shape[1])), p]), axis=0)
        means = (c[k:] - c[:-k]) / k
        return int(np.argmax(embed.unit(means) @ m))
    raise ValueError(method)


def phrases(p, t, bars):
    """Means of whole phrases of `bars` bars on the beat grid (patches fully inside the phrase)."""
    bpm, first = t.get('grid_bpm'), t.get('first_beat_ms')
    if not bpm or first is None:
        return None
    length = bars * 4 * 60.0 / bpm
    starts, ends = embed.patch_times(p.shape[0])
    out = []
    s = (first / 1000.0) % length
    while s + length <= ends[-1] + 1e-6:
        inside = (starts >= s) & (ends <= s + length)
        if inside.sum() >= 2:
            out.append(p[inside].mean(axis=0))
        s += length
    return np.array(out) if len(out) >= 2 else None


def kmeans_centres(p, k=4):
    from sklearn.cluster import KMeans
    km = KMeans(n_clusters=min(k, len(p)), n_init=4, random_state=SEED).fit(embed.unit(p))
    return km.cluster_centers_


def build(tracks, patches, loud):
    ids = [t['track_id'] for t in tracks]
    means = np.array([patches[i].mean(axis=0) for i in ids])
    reps = {}
    reps['mean'] = ('vec', ids, means)
    reps['median'] = ('vec', ids, np.array([np.median(patches[i], axis=0) for i in ids]))
    reps['mean+std'] = ('vec', ids, np.array([np.concatenate([patches[i].mean(0), patches[i].std(0)]) for i in ids]))
    centre = means.mean(axis=0)
    reps['centred'] = ('vec', ids, means - centre)
    # PCA whitening on the sample: 500 tracks cannot support 1280 dimensions, so the top 128 components.
    u, s, vt = np.linalg.svd(means - centre, full_matrices=False)
    comps = 128
    reps['whitened-128'] = ('vec', ids, (means - centre) @ vt[:comps].T / (s[:comps] / math.sqrt(len(ids) - 1)))
    for seconds in SECTION_SECONDS:
        k = patches_for(seconds)
        for method in SECTION_METHODS:
            vecs, starts = [], {}
            for t in tracks:
                p = patches[t['track_id']]
                st = section_start(p, method, k, t['duration'], loud.get(t['track_id']))
                starts[t['track_id']] = st * PATCH_HOP_SECONDS
                vecs.append(window_mean(p, st, k))
            reps[f'section-{seconds}s-{method}'] = ('vec', ids, np.array(vecs))
            out_path(STEP, 'section-starts', f'{seconds}s-{method}.json').write_text(json.dumps(starts))
    for bars in (16, 32):
        sets = {t['track_id']: phrases(patches[t['track_id']], t, bars) for t in tracks}
        sids = [i for i in ids if sets[i] is not None]
        reps[f'phrases-{bars}bar'] = ('set', sids, [sets[i] for i in sids])
        reps[f'phrases-{bars}bar-best'] = ('best', sids, [sets[i] for i in sids])
    reps['kmeans-4'] = ('set', ids, [kmeans_centres(patches[i]) for i in ids])
    return reps


# ---------- distances ----------

def distances(kind, data):
    if kind == 'vec':
        u = embed.unit(np.asarray(data, dtype=np.float64))
        return 1.0 - u @ u.T
    owners = np.concatenate([np.full(len(v), j) for j, v in enumerate(data)])
    allv = embed.unit(np.vstack(data).astype(np.float64))
    sims = allv @ allv.T
    starts = np.concatenate([[0], np.cumsum([len(v) for v in data])[:-1]])
    best_per_group = np.maximum.reduceat(sims, starts, axis=1)  # (V, n): best match of each vector in each track
    n = len(data)
    if kind == 'best':
        top = np.maximum.reduceat(best_per_group, starts, axis=0)  # (n, n)
        return 1.0 - top
    directed = np.zeros((n, n))
    for i in range(n):
        directed[i] = best_per_group[owners == i].mean(axis=0)
    return 1.0 - (directed + directed.T) / 2


def knn(d, k=K_NN):
    d = d.copy()
    np.fill_diagonal(d, np.inf)
    return np.argsort(d, axis=1)[:, :k]


def compare(name, ids, d, ref_ids, ref_d, by_id):
    """Compare representation distances d (over ids) with the mean's (restricted to the same ids)."""
    pos = {i: j for j, i in enumerate(ref_ids)}
    idx = np.array([pos[i] for i in ids])
    rd = ref_d[np.ix_(idx, idx)]
    nn, rnn = knn(d), knn(rd)
    overlap = np.array([len(set(a) & set(b)) for a, b in zip(nn, rnn)])
    iu = np.triu_indices(len(ids), 1)
    rho = spearmanr(d[iu], rd[iu]).statistic
    gained, lost = [], []
    for row, (a, b) in enumerate(zip(nn, rnn)):
        q = by_id[ids[row]]
        for j in set(a) - set(b):
            gained.append(attributes.pair(q, by_id[ids[j]]))
        for j in set(b) - set(a):
            lost.append(attributes.pair(q, by_id[ids[j]]))

    def agg(rows, key, fn):
        vals = [r[key] for r in rows if r[key] is not None]
        return round(float(fn(vals)), 3) if vals else None

    row = {'representation': name, 'tracks': len(ids), 'top10_overlap_mean': round(float(overlap.mean()), 2),
           'top10_overlap_p10': float(np.percentile(overlap, 10)), 'spearman': round(float(rho), 3),
           'changed_neighbours': len(gained)}
    for label, rows in (('gained', gained), ('lost', lost)):
        row[f'{label}_bpm_diff_median'] = agg(rows, 'bpm_diff', np.median)
        row[f'{label}_key_dist_median'] = agg(rows, 'key_dist', np.median)
        for key in ('same_genre', 'same_label', 'same_artist', 'same_crate'):
            row[f'{label}_{key}'] = agg(rows, key, np.mean)
        row[f'{label}_energy_diff_median'] = agg(rows, 'energy_diff', np.median)
    # Largest disagreements: a representation's top-1 neighbour that the mean ranks far away.
    disagreements = []
    rranks = np.argsort(np.argsort(np.where(np.eye(len(ids), dtype=bool), np.inf, rd), axis=1), axis=1)
    for r in range(len(ids)):
        j = nn[r][0]
        disagreements.append({'representation': name, 'track_id': ids[r], 'neighbour_id': ids[j],
                              'mean_rank': int(rranks[r, j]) + 1, 'overlap': int(overlap[r])})
    disagreements.sort(key=lambda x: -x['mean_rank'])
    return row, disagreements[:15]


def choose_unit(rows):
    by = {r['representation']: r for r in rows}
    for seconds in SECTION_SECONDS:
        for method in SECTION_METHODS:
            r = by.get(f'section-{seconds}s-{method}')
            if r and r['top10_overlap_mean'] >= UNIT_MIN_OVERLAP:
                return {'unit': 'section', 'seconds': seconds, 'method': method,
                        'top10_overlap_mean': r['top10_overlap_mean']}
    return {'unit': 'full'}


def unit():
    return json.loads(out_path(STEP, 'unit.json').read_text())


def extra_representations(tracks):
    """Style probabilities and stem embeddings, when their steps have run."""
    from . import stems, style
    out = {}
    if style.available():
        ids = [t['track_id'] for t in tracks if style.path(t['track_id']).exists()]
        if ids:
            out['style-400'] = ('vec', ids, np.array([np.load(style.path(i)) for i in ids]))
    else:
        print(f'[{STEP}] style-400 skipped: model not present', flush=True)
    ids = [t['track_id'] for t in tracks if all(stems.patches_path(t['track_id'], s).exists() for s in stems.STEMS)]
    if ids:
        m = {s: np.array([stems.load_patches(i, s).mean(0) for i in ids]) for s in stems.STEMS}
        # The stems cover the Part 2 unit only; compare with section-<unit> to separate the section effect.
        for s in stems.STEMS:
            out[f'stem-{s}'] = ('vec', ids, m[s])
        out['stems-equal-weights'] = ('vec', ids, np.hstack([embed.unit(m[s]) for s in stems.STEMS]))
        out['stems-drums+bass'] = ('vec', ids, np.hstack([embed.unit(m[s]) for s in ('drums', 'bass')]))
        out['stems-other+vocals'] = ('vec', ids, np.hstack([embed.unit(m[s]) for s in ('other', 'vocals')]))
    return out


def run(workers=3, extra=extra_representations):
    tracks = sample.read('part1')
    have = [t for t in tracks if fullembed._path(t['track_id']).exists()]
    lstep = Step('loudness')
    lstep.run(have, _loudness_work, key=lambda t: t['track_id'], workers=workers)
    lstep.summary()
    by_id = {t['track_id']: t for t in have}
    patches = {t['track_id']: fullembed.load(t['track_id']).astype(np.float64) for t in have}
    loud = {t['track_id']: np.load(_loudness_path(t['track_id'])) for t in have
            if _loudness_path(t['track_id']).exists()}
    have = [t for t in have if t['track_id'] in loud]
    reps = build(have, patches, loud)
    if extra:
        reps.update(extra(have))
    step = Step(STEP)
    _, ref_ids, ref_data = reps['mean']
    ref_d = distances('vec', ref_data)
    rows, dis = [], []
    for name, (kind, ids, data) in reps.items():
        if name == 'mean' or len(ids) < 50:
            continue
        r, d = compare(name, ids, distances(kind, data), ref_ids, ref_d, by_id)
        rows.append(r)
        dis.extend(d)
        print(f"[{STEP}] {name}: overlap {r['top10_overlap_mean']} rho {r['spearman']}", flush=True)
    step.results_path.unlink(missing_ok=True)
    step.add(rows)
    dpath = step.path('disagreements.csv')
    dpath.unlink(missing_ok=True)
    Step._append(dpath, dis)
    np.save(step.path('mean-ids.npy'), np.array(ref_ids))
    np.save(step.path('mean-vectors.npy'), np.asarray(ref_data, dtype=np.float32))
    u = choose_unit(rows)
    out_path(STEP, 'unit.json').write_text(json.dumps(u))
    step.processed = len(rows)
    return step.summary(unit=u, tracks=len(have))
