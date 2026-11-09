"""Seeded samples, stratified by AKIN crate and genre.

part1  - the Part 1 sample and the reference set for Part 2 shifts
stems  - Part 1 tracks with a beat grid that get stems (stem representation, swaps, offsets)
part2  - Part 1 tracks that get the audio changes
"""
import csv
import json
import random

from . import audio
from .catalog import tracks
from .config import SEED, out_path

MIN_SECONDS = 60
GENRE_ALIASES = {'drum and bass': 'drum & bass', 'dnb': 'drum & bass', 'd&b': 'drum & bass'}
FIELDS = ['track_id', 'track_path', 'track_artist', 'track_title', 'track_key', 'track_bpm', 'track_genre',
          'track_energy', 'track_label', 'first_beat_ms', 'grid_bpm', 'crates', 'duration']


def genre_bucket(genre):
    g = (genre or '').strip().lower()
    return GENRE_ALIASES.get(g, g) or 'unknown'


def stratum(t):
    """The first hand-made crate if any, else the genre."""
    return f"crate:{sorted(t['crates'])[0]}" if t['crates'] else f"genre:{genre_bucket(t['track_genre'])}"


def stratified(items, n, seed, accept=lambda t: True):
    """Round-robin over seeded-shuffled strata; deterministic for the same items and seed."""
    rng = random.Random(seed)
    groups = {}
    for t in sorted(items, key=lambda t: t['track_id']):
        groups.setdefault(stratum(t), []).append(t)
    keys = sorted(groups)
    rng.shuffle(keys)
    for k in keys:
        rng.shuffle(groups[k])
    picked = []
    while len(picked) < n and any(groups[k] for k in keys):
        for k in keys:
            while groups[k]:
                t = groups[k].pop()
                if accept(t):
                    picked.append(t)
                    break
            if len(picked) >= n:
                break
    return picked


def _durations():
    path = out_path('sample', 'durations.json')
    cache = json.loads(path.read_text()) if path.exists() else {}

    def get(t):
        key = str(t['track_id'])
        if key not in cache:
            try:
                cache[key] = audio.duration(t['track_path'])
            except Exception:
                cache[key] = 0.0
            path.write_text(json.dumps(cache))
        return cache[key]
    return get


def write(name, rows):
    path = out_path('sample', f'{name}.csv')
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction='ignore')
        w.writeheader()
        for r in rows:
            w.writerow({**r, 'crates': '|'.join(r['crates'])})
    return path


def read(name):
    with open(out_path('sample', f'{name}.csv'), newline='') as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r['track_id'] = int(r['track_id'])
        r['crates'] = [c for c in r['crates'].split('|') if c]
        r['duration'] = float(r['duration'])
        for k in ('track_bpm', 'grid_bpm', 'first_beat_ms', 'track_energy'):
            r[k] = float(r[k]) if r.get(k) not in (None, '') else None
    return rows


def has_grid(t):
    return t.get('first_beat_ms') is not None and t.get('grid_bpm')


def run(conn, n_part1=500, n_stems=200, n_part2=300, seed=SEED):
    all_tracks = tracks(conn)
    dur = _durations()

    def long_enough(t):
        t['duration'] = dur(t)
        return t['duration'] >= MIN_SECONDS

    # Half the Part 1 sample from tracks with a beat grid, so the grid-dependent tests have enough tracks.
    grid = stratified([t for t in all_tracks if has_grid(t)], n_part1 // 2, seed, long_enough)
    grid_ids = {t['track_id'] for t in grid}
    rest = stratified([t for t in all_tracks if t['track_id'] not in grid_ids], n_part1 - len(grid), seed,
                      long_enough)
    part1 = grid + rest
    stems = stratified([t for t in part1 if has_grid(t)], n_stems, seed + 1)
    part2 = stratified(part1, n_part2, seed + 2)
    for name, rows in (('part1', part1), ('stems', stems), ('part2', part2)):
        write(name, rows)
    summary = {'catalog_tracks': len(all_tracks), 'with_grid': sum(1 for t in all_tracks if has_grid(t)),
               'part1': len(part1), 'part1_with_grid': len(grid), 'stems': len(stems), 'part2': len(part2),
               'strata_part1': len({stratum(t) for t in part1}), 'seed': seed}
    out_path('sample', 'summary.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary))
    return summary
