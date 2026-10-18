"""Track attributes used to describe neighbours: BPM, Camelot key, genre, label, artist, crates."""
import math
import re

_CAMELOT = re.compile(r'^\s*(\d{1,2})\s*([AB])\s*$', re.I)


def camelot(key):
    m = _CAMELOT.match(key or '')
    if not m:
        return None
    n = int(m.group(1))
    return (n, m.group(2).upper()) if 1 <= n <= 12 else None


def key_distance(a, b):
    """Steps on the Camelot wheel, +1 when the mode (A/B) differs. None when either key is unknown."""
    ka, kb = camelot(a), camelot(b)
    if not ka or not kb:
        return None
    d = abs(ka[0] - kb[0]) % 12
    return min(d, 12 - d) + (0 if ka[1] == kb[1] else 1)


def bpm_difference(a, b):
    """Relative tempo difference in percent with half and double time folded. None when either is unknown."""
    if not a or not b or a <= 0 or b <= 0:
        return None
    r = math.log2(a / b)
    return (2 ** min(abs(r), abs(r - 1), abs(r + 1)) - 1) * 100


def norm(s):
    return (s or '').strip().lower()


def genre(t):
    from .sample import genre_bucket
    return genre_bucket(t.get('track_genre'))


def artists(t):
    return {norm(a) for a in re.split(r',|&| feat\.? | ft\.? | x | vs\.? ', t.get('track_artist') or '', flags=re.I)
            if norm(a)}


def pair(a, b):
    """Attribute comparison of two tracks."""
    ga, gb = genre(a), genre(b)
    la, lb = norm(a.get('track_label')), norm(b.get('track_label'))
    ea, eb = a.get('track_energy'), b.get('track_energy')
    return {
        'bpm_diff': bpm_difference(a.get('grid_bpm') or a.get('track_bpm'), b.get('grid_bpm') or b.get('track_bpm')),
        'key_dist': key_distance(a.get('track_key'), b.get('track_key')),
        'same_genre': None if 'unknown' in (ga, gb) else ga == gb,
        'same_label': None if not la or not lb else la == lb,
        'same_artist': bool(artists(a) & artists(b)) if artists(a) and artists(b) else None,
        'same_crate': bool(set(a['crates']) & set(b['crates'])) if a['crates'] and b['crates'] else None,
        'energy_diff': abs(ea - eb) if ea is not None and eb is not None else None,
    }
