"""Bar-aligned stem swaps and stem offsets.

Adapted, not imported, from the stem mashup renderer in dj-automation (branch stem-mashup-augmentation,
cue_model/mashup/{render,stretch,levels}.py at e2f05db): stems are cut on the donor's bar lines, stretched with
sox (WSOLA; rubberband's artefacts alone moved the embedding, see transforms.py) to the host tempo, placed on the host's first bar, trimmed or padded to the host's bar count, and the donor
stem is levelled once to the RMS of the host's same stem (±12 dB cap). Simplified for research: one region per track
instead of section-by-section assembly, no phrase restructuring.
"""
import numpy as np

from . import audio, stems
from .transforms import SR, sox_tempo

LAYERS = {'drums': ('drums',), 'bass': ('bass',), 'music': ('other', 'vocals')}
LEVEL_CAP_DB = 12.0


def bar_seconds(bpm):
    return 4 * 60.0 / bpm


def fold_bpm(bpm, target):
    """bpm halved or doubled to be closest to target."""
    return min((bpm / 2, bpm, bpm * 2), key=lambda b: abs(np.log2(b / target)))


def region(t, start, seconds):
    """(start, bars) of the whole-bar region that begins on the first bar line at or after `start` and covers about
    `seconds`."""
    bar = bar_seconds(t['grid_bpm'])
    first = t['first_beat_ms'] / 1000.0
    k = int(np.ceil((start - first) / bar)) if start > first else 0
    s = first + k * bar
    bars = max(4, int(round(seconds / bar)))
    if s + bars * bar > t['duration']:
        bars = int((t['duration'] - s) // bar)
    return s, bars


def load_stems(track_id, start, end):
    out = {st: stems.read(track_id, st, start, end) for st in stems.STEMS}
    n = min(len(v) for v in out.values())
    return {k: v[:n] for k, v in out.items()}


def layer_of(parts, layer):
    return sum(parts[s] for s in LAYERS[layer])


_bar_energy = {}


def busiest_region(t, layer, seconds):
    """Start (seconds) of the donor's region of about `seconds` where the layer is loudest, on its own bar lines,
    inside the separated region."""
    import json
    from .config import out_path
    bar = bar_seconds(t['grid_bpm'])
    bars = max(1, int(round(seconds / bar)))
    sep = json.loads(out_path('stems', str(t['track_id']), 'region.json').read_text())
    beat0 = t['first_beat_ms'] / 1000.0
    first = beat0 + max(0, int(np.ceil((sep['start'] - beat0) / bar))) * bar
    total = int((sep['end'] - first) // bar)
    if total < bars:
        raise ValueError(f'donor region has {total} bars, {bars} needed')
    key = (t['track_id'], layer)
    if key not in _bar_energy:
        x = layer_of(load_stems(t['track_id'], first, first + total * bar), layer).mean(axis=1)
        _bar_energy[key] = np.array([np.mean(x[int(i * bar * SR):int((i + 1) * bar * SR)] ** 2)
                                     for i in range(total)])
    per_bar = _bar_energy[key]
    sums = np.convolve(per_bar, np.ones(bars), 'valid')
    return first + int(np.argmax(sums)) * bar


def stretch_to(x, from_bpm, to_bpm):
    ratio = to_bpm / from_bpm
    if abs(ratio - 1) < 1e-4:
        return x
    return sox_tempo(x, ratio)


def fit_length(x, n):
    return x[:n] if len(x) >= n else np.pad(x, ((0, n - len(x)), (0, 0)))


def level_to(x, reference):
    gain_db = audio.rms_db(reference) - audio.rms_db(x)
    gain_db = float(np.clip(gain_db, -LEVEL_CAP_DB, LEVEL_CAP_DB))
    return (x * 10 ** (gain_db / 20)).astype(np.float32), gain_db


def swap(host, host_start, bars, donor, layer):
    """Returns (mashup, host_sum, donor_sum_stretched, info), all at the host tempo over the host region."""
    hbar = bar_seconds(host['grid_bpm'])
    hparts = load_stems(host['track_id'], host_start, host_start + bars * hbar)
    n = len(hparts['drums'])
    donor_bpm = fold_bpm(donor['grid_bpm'], host['grid_bpm'])
    dbar = 4 * 60.0 / donor_bpm
    dstart = busiest_region(donor, layer, bars * dbar)
    dparts = load_stems(donor['track_id'], dstart, dstart + bars * dbar)
    dlayer = fit_length(stretch_to(layer_of(dparts, layer), donor_bpm, host['grid_bpm']), n)
    hlayer = layer_of(hparts, layer)
    dlayer, gain = level_to(dlayer, hlayer)
    host_sum = sum(hparts.values())
    mashup = host_sum - hlayer + dlayer
    donor_sum = fit_length(stretch_to(sum(dparts.values()), donor_bpm, host['grid_bpm']), n)
    return mashup, host_sum, donor_sum, {'donor_start': round(dstart, 3), 'gain_db': round(gain, 2),
                                         'donor_bpm_folded': round(donor_bpm, 2)}


OFFSETS = ('1/16', 'beat', 'bar', '37ms')


def offset_samples(bpm, kind):
    beat = 60.0 / bpm
    seconds = {'1/16': beat / 4, 'beat': beat, 'bar': 4 * beat, '37ms': 0.037}[kind]
    return int(round(seconds * SR))


def shifted(parts, layer, samples):
    """The recombination with one layer delayed by `samples`, wrapped within the whole-bar region."""
    others = sum(parts[s] for s in stems.STEMS if s not in LAYERS[layer])
    return others + np.roll(layer_of(parts, layer), samples, axis=0)
