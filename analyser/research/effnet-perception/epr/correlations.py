"""Part 3: what explains closeness across the whole catalogue, and what can be read off the embedding.

Uses AKIN's stored means (its ONNX port of the same model) after a parity check against the means recomputed in
embed-full. Pairs are a seeded random sample of track pairs.
"""
import json

import numpy as np
from scipy.stats import spearmanr

from . import attributes, catalog, embed, fullembed, sample
from .config import SEED, out_path
from .steps import Step

STEP = 'correlations'
N_PAIRS = 300_000
PARITY_MIN = 0.99


def parity(stored):
    rows = []
    for t in sample.read('part1')[:40]:
        if t['track_id'] in stored and fullembed._path(t['track_id']).exists():
            c = 1 - embed.cos_dist(stored[t['track_id']], fullembed.load(t['track_id']).mean(0))
            rows.append(c)
    return {'tracks': len(rows), 'min_cosine': round(float(np.min(rows)), 5) if rows else None,
            'median_cosine': round(float(np.median(rows)), 5) if rows else None}


def binned(x, y, edges):
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        sel = (x >= lo) & (x < hi)
        if sel.sum() >= 30:
            out.append({'from': lo, 'to': hi, 'pairs': int(sel.sum()), 'median_dist': round(float(np.median(y[sel])), 4)})
    return out


def probes(X, tracks):
    from sklearn.linear_model import LogisticRegression, RidgeCV
    from sklearn.model_selection import cross_val_score, cross_val_predict
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    res = {}
    bpm = np.array([t.get('grid_bpm') or t.get('track_bpm') or np.nan for t in tracks], dtype=float)
    sel = np.isfinite(bpm) & (bpm > 50) & (bpm < 250)
    model = make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-1, 4, 12)))
    pred = cross_val_predict(model, X[sel], bpm[sel], cv=5)
    folded = np.array([attributes.bpm_difference(a, b) for a, b in zip(pred, bpm[sel])])
    res['bpm'] = {'tracks': int(sel.sum()), 'r2': round(float(1 - np.mean((pred - bpm[sel]) ** 2) / np.var(bpm[sel])), 3),
                  'mae': round(float(np.mean(np.abs(pred - bpm[sel]))), 2),
                  'baseline_mae': round(float(np.mean(np.abs(bpm[sel] - np.median(bpm[sel])))), 2),
                  'within_4pct_folded': round(float(np.mean(folded <= 4)), 3)}

    def classify(name, labels, min_count):
        labels = np.array(labels, dtype=object)
        values, counts = np.unique([l for l in labels if l], return_counts=True)
        keep = set(values[counts >= min_count])
        sel = np.array([l in keep for l in labels])
        if sel.sum() < 100 or len(keep) < 2:
            res[name] = {'skipped': f'{sel.sum()} labelled tracks, {len(keep)} classes'}
            return
        y = labels[sel].astype(str)
        clf = make_pipeline(StandardScaler(), LogisticRegression(max_iter=3000, C=0.05))
        acc = cross_val_score(clf, X[sel], y, cv=5, scoring='balanced_accuracy')
        _, c = np.unique(y, return_counts=True)
        res[name] = {'tracks': int(sel.sum()), 'classes': len(keep), 'balanced_accuracy': round(float(acc.mean()), 3),
                     'chance_balanced': round(1 / len(keep), 3), 'majority_rate': round(float(c.max() / c.sum()), 3)}

    keys = [attributes.camelot(t.get('track_key')) for t in tracks]
    classify('key', [f'{k[0]}{k[1]}' if k else None for k in keys], 30)
    classify('mode', [k[1] if k else None for k in keys], 30)
    classify('genre', [attributes.genre(t) if attributes.genre(t) != 'unknown' else None for t in tracks], 30)
    classify('label', [attributes.norm(t.get('track_label')) or None for t in tracks], 15)
    return res


def run():
    step = Step(STEP)
    conn = catalog.connect()
    stored = catalog.stored_means(conn)
    par = parity(stored)
    tracks = [t for t in catalog.tracks(conn) if t['track_id'] in stored]
    ids = [t['track_id'] for t in tracks]
    X = embed.unit(np.array([stored[i] for i in ids]))
    rng = np.random.default_rng(SEED)
    a = rng.integers(0, len(ids), N_PAIRS)
    b = rng.integers(0, len(ids), N_PAIRS)
    keep = a != b
    a, b = a[keep], b[keep]
    dist = 1 - np.einsum('ij,ij->i', X[a], X[b])
    feats = [attributes.pair(tracks[i], tracks[j]) for i, j in zip(a, b)]

    def col(k):
        return np.array([np.nan if f[k] is None else float(f[k]) for f in feats])

    report = {'parity': par, 'tracks': len(ids), 'pairs': int(len(dist)), 'factors': {}}
    for k in ('bpm_diff', 'key_dist', 'energy_diff', 'same_genre', 'same_label', 'same_artist', 'same_crate'):
        v = col(k)
        sel = np.isfinite(v)
        entry = {'pairs': int(sel.sum())}
        if sel.sum() > 100:
            entry['spearman'] = round(float(spearmanr(v[sel], dist[sel]).statistic), 4)
            if k.startswith('same_'):
                entry['median_dist_same'] = round(float(np.median(dist[sel & (v == 1)])), 4) if (v == 1).sum() else None
                entry['median_dist_different'] = round(float(np.median(dist[sel & (v == 0)])), 4)
                entry['pairs_same'] = int((v == 1).sum())
        report['factors'][k] = entry
    report['factors']['bpm_diff']['bins'] = binned(col('bpm_diff'), dist, [0, 1, 2, 4, 8, 15, 25, 40, 100])
    report['factors']['key_dist']['bins'] = binned(col('key_dist'), dist, [0, 1, 2, 3, 4, 5, 6, 7, 8])
    report['factors']['energy_diff']['bins'] = binned(col('energy_diff'), dist, [0, 1, 2, 3, 4, 6, 10])
    # Joint view: standardised linear regression of distance on all factors over complete pairs.
    names = ['bpm_diff', 'key_dist', 'energy_diff', 'same_genre', 'same_label', 'same_artist']
    M = np.column_stack([col(k) for k in names])
    sel = np.all(np.isfinite(M), axis=1)
    if sel.sum() > 1000:
        Z = (M[sel] - M[sel].mean(0)) / (M[sel].std(0) + 1e-12)
        zy = (dist[sel] - dist[sel].mean()) / dist[sel].std()
        coef, *_ = np.linalg.lstsq(np.column_stack([Z, np.ones(len(Z))]), zy, rcond=None)
        r2 = 1 - np.mean((np.column_stack([Z, np.ones(len(Z))]) @ coef - zy) ** 2)
        report['joint'] = {'pairs': int(sel.sum()), 'r2': round(float(r2), 4),
                           'standardised_coef': {k: round(float(c), 4) for k, c in zip(names, coef)}}
    report['probes'] = probes(X, tracks)
    out_path(STEP, 'report.json').write_text(json.dumps(report, indent=2))
    step.processed = 1
    ok = par['min_cosine'] is not None and par['min_cosine'] >= PARITY_MIN
    if not ok:
        step.fail('parity', f'stored means differ from recomputed: {par}')
    return step.summary(parity=par)
