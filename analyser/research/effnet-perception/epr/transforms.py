"""Audio changes for Part 2 and their verifiers.

Each change takes stereo float32 audio (n, 2) at 44.1 kHz and returns the changed audio at the same rate. Each has a
verifier that measures the result and returns (ok, measured value). A change that fails its verifier is recorded as
a failure, never embedded.

Tempo and pitch use sox (WSOLA `tempo -m`, `pitch`): at a near-zero setting (0.1 % tempo, 0.02 semitones) it moves the
embedding by ~0.0005, where rubberband's R2 engine moved it by 0.008-0.04 and the R3 (--fine) engine by ~0.13 on a
round trip - the engine's own artefacts, not the tempo. The near-zero settings stay in as controls, and one R3 control
documents that engine's artefacts.

Note: the model hears the (L+R)/2 downmix, so changes that only touch the side signal (mono, stereo width) cannot
move the embedding. "mono" stays in as a check of the pipeline: its shift must be ~0.
"""
import os
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d, uniform_filter1d

from . import audio

SR = audio.HQ_SR


# ---------- helpers ----------

def _tmpdir():
    from .config import out_path
    d = out_path('changes', 'work', str(os.getpid()), 'x').parent
    d.mkdir(parents=True, exist_ok=True)
    return d


def _through_files(x, cmd_builder, out_suffix='.wav'):
    d = _tmpdir()
    with tempfile.NamedTemporaryFile(dir=d, suffix='.wav', delete=False) as fi:
        src = Path(fi.name)
    dst = src.with_name(src.stem + '-out' + out_suffix)
    try:
        audio.write_wav(src, x, SR)
        for cmd in cmd_builder(src, dst):
            subprocess.run(cmd, capture_output=True, check=True)
        if out_suffix == '.wav':
            y, sr = audio.read_wav(dst)
        else:
            y = audio.load_stereo(dst)
            sr = SR
        assert sr == SR, sr
        return y
    finally:
        for p in (src, dst):
            p.unlink(missing_ok=True)


def band_energy(x, lo, hi):
    mono = x.mean(axis=1) if x.ndim == 2 else x
    f, pxx = signal.welch(mono, SR, nperseg=8192)
    sel = (f >= lo) & (f < hi)
    return 10 * np.log10(pxx[sel].sum() + 1e-20)


def pitch_shift_measured(a, b, lo=80, hi=4000, per_semitone=24, max_shift=4):
    """Semitone shift from b relative to a, by cross-correlating whitened log-frequency spectra (the spectral
    envelope, a 3-semitone moving average, is removed so the harmonic peaks decide - without it, drum-heavy tracks
    read as 0 for shifts of 2 semitones or more)."""
    def logspec(x):
        mono = x.mean(axis=1) if x.ndim == 2 else x
        f, pxx = signal.welch(mono, SR, nperseg=16384)
        grid = lo * 2 ** (np.arange(int(12 * per_semitone * np.log2(hi / lo))) / (12 * per_semitone))
        s = np.log(np.interp(grid, f, pxx) + 1e-20)
        return s - uniform_filter1d(s, 3 * per_semitone)
    sa, sb = logspec(a), logspec(b)
    lags = np.arange(-max_shift * per_semitone, max_shift * per_semitone + 1)
    scores = [np.dot(sa[max(0, -l):len(sa) - max(0, l)], sb[max(0, l):len(sb) - max(0, -l)]) for l in lags]
    return lags[int(np.argmax(scores))] / per_semitone


def crest_db(x):
    mono = x.mean(axis=1)
    return 20 * np.log10(np.max(np.abs(mono)) / (np.sqrt(np.mean(mono ** 2)) + 1e-12) + 1e-12)


def butter(x, kind, freq, order=8):
    sos = signal.butter(order, freq, btype=kind, fs=SR, output='sos')
    return signal.sosfiltfilt(sos, x, axis=0).astype(np.float32)


# ---------- changes ----------

def sox_tempo(x, factor):
    return _through_files(x, lambda s, d: [['sox', str(s), str(d), 'tempo', '-m', f'{factor:.6f}']])


def stretch(pct):
    def gen(x, ctx):
        return sox_tempo(x, 1 + pct / 100)

    def verify(x, y, ctx):
        ratio = len(x) / len(y)
        return abs(ratio - (1 + pct / 100)) < 0.01 and abs(pitch_shift_measured(x, y)) <= 0.25, round(ratio, 4)
    return gen, verify


def rubberband_fine_control():
    """R3 engine at 0.1 % tempo: what the engine itself does to the embedding."""
    def gen(x, ctx):
        return _through_files(x, lambda s, d: [['rubberband', '-q', '--fine', '-T', '1.001', str(s), str(d)]])

    def verify(x, y, ctx):
        return abs(len(x) / len(y) - 1.001) < 0.01, round(len(x) / len(y), 4)
    return gen, verify


def pitch(semitones):
    def gen(x, ctx):
        return _through_files(x, lambda s, d: [['sox', str(s), str(d), 'pitch', f'{semitones * 100:.2f}']])

    def verify(x, y, ctx):
        m = pitch_shift_measured(x, y)
        return abs(m - semitones) <= 0.25 and abs(len(y) / len(x) - 1) < 0.01, round(m, 3)
    return gen, verify


def varispeed(pct):
    r = Fraction(1 + pct / 100).limit_denominator(1000)

    def gen(x, ctx):
        # Played r times faster: same samples, read at SR * r, then back to SR.
        return signal.resample_poly(x, r.denominator, r.numerator, axis=0).astype(np.float32)

    def verify(x, y, ctx):
        ratio = len(x) / len(y)
        m = pitch_shift_measured(x, y)
        want = 12 * np.log2(float(r))
        return abs(ratio - float(r)) < 0.01 and abs(m - want) <= 0.3, round(m, 3)
    return gen, verify


def codec(name, kbps):
    def gen(x, ctx):
        enc = ['-c:a', 'libmp3lame', '-b:a', f'{kbps}k'] if name == 'mp3' else ['-c:a', 'aac', '-b:a', f'{kbps}k']
        suffix = '.mp3' if name == 'mp3' else '.m4a'
        y = _through_files(x, lambda s, d: [['ffmpeg', '-v', 'error', '-y', '-i', str(s), *enc, str(d)]], suffix)
        ctx['_bitrate'] = kbps
        return y[:len(x)] if len(y) >= len(x) else np.pad(y, ((0, len(x) - len(y)), (0, 0)))

    def verify(x, y, ctx):
        # The encoder honours CBR; the round trip must keep the length and the audio must stay close.
        c = np.corrcoef(x.mean(1)[:len(y)], y.mean(1)[:len(x)])[0, 1]
        return c > 0.9, round(float(c), 4)
    return gen, verify


def lowpass(hz):
    def gen(x, ctx):
        return butter(x, 'lowpass', hz)

    def verify(x, y, ctx):
        drop = band_energy(x, hz * 1.3, 20000) - band_energy(y, hz * 1.3, 20000)
        return drop >= 24 or band_energy(x, hz * 1.3, 20000) < -100, round(drop, 1)
    return gen, verify


def highpass(hz):
    def gen(x, ctx):
        return butter(x, 'highpass', hz)

    def verify(x, y, ctx):
        drop = band_energy(x, 20, hz / 1.5) - band_energy(y, 20, hz / 1.5)
        return drop >= 24 or band_energy(x, 20, hz / 1.5) < -100, round(drop, 1)
    return gen, verify


EQ_BANDS = {'sub': (30, 80), 'low-mid': (200, 500), 'presence': (2000, 5000), 'air': (10000, 16000)}


def eq(band, db):
    lo, hi = EQ_BANDS[band]

    def gen(x, ctx):
        b = butter(x, 'bandpass', [lo, hi], order=4)
        return (x + (10 ** (db / 20) - 1) * b).astype(np.float32)

    def verify(x, y, ctx):
        change = band_energy(y, lo * 1.15, hi / 1.15) - band_energy(x, lo * 1.15, hi / 1.15)
        return abs(change - db) <= 2.0, round(change, 2)
    return gen, verify


def limit(gain_db=12.0, ceiling=0.98, lookahead_ms=1.5, release_ms=60.0):
    """Push the track `gain_db` past its own peak into a lookahead brickwall limiter (instant attack, exponential
    release). Mastered music is already limited, so a plain compressor barely changes it (0.4 dB crest in the
    trial)."""
    def gen(x, ctx):
        y = x * (ceiling / (np.max(np.abs(x)) + 1e-12)) * 10 ** (gain_db / 20)
        need = np.minimum(1.0, ceiling / (np.max(np.abs(y), axis=1) + 1e-12))
        la = max(1, int(lookahead_ms / 1000 * SR))
        g = -maximum_filter1d(-need, size=2 * la + 1)  # running minimum: reduction starts before the peak
        coef = np.exp(-1.0 / (release_ms / 1000 * SR))
        out = np.empty_like(g)
        cur = 1.0
        for i, v in enumerate(g):
            cur = v if v < cur else v + (cur - v) * coef
            out[i] = cur
        return np.clip(y * out[:, None], -ceiling, ceiling).astype(np.float32)

    def verify(x, y, ctx):
        d = crest_db(x) - crest_db(y)
        return d >= 1.5, round(d, 2)
    return gen, verify


def mono():
    def gen(x, ctx):
        m = x.mean(axis=1, keepdims=True)
        return np.repeat(m, 2, axis=1)

    def verify(x, y, ctx):
        return bool(np.allclose(y[:, 0], y[:, 1])), 0
    return gen, verify


def resample(sr2):
    def gen(x, ctx):
        r = Fraction(sr2, SR)
        down = signal.resample_poly(x, r.numerator, r.denominator, axis=0)
        return signal.resample_poly(down, r.denominator, r.numerator, axis=0)[:len(x)].astype(np.float32)

    def verify(x, y, ctx):
        drop = band_energy(x, sr2 / 2 * 1.05, 20000) - band_energy(y, sr2 / 2 * 1.05, 20000)
        return drop >= 20 or band_energy(x, sr2 / 2 * 1.05, 20000) < -100, round(drop, 1)
    return gen, verify


def noise(kind, snr_db):
    def gen(x, ctx):
        rng = np.random.default_rng(ctx['seed'])
        if kind == 'white':
            n = rng.standard_normal(x.shape)
        else:  # vinyl: band-limited hiss plus sparse clicks
            n = butter(rng.standard_normal(x.shape), 'bandpass', [300, 8000], order=2) * 0.3
            clicks = np.zeros(len(x))
            pos = rng.integers(0, len(x), size=max(1, len(x) // SR * 6))
            clicks[pos] = rng.choice([-1, 1], size=len(pos)) * rng.uniform(5, 20, size=len(pos))
            n = n + butter(np.stack([clicks, clicks], 1), 'highpass', 1000, order=2)
        sig_p = np.mean(x ** 2)
        n = n * np.sqrt(sig_p / (np.mean(n ** 2) + 1e-20) / 10 ** (snr_db / 10))
        ctx['_noise_power'] = float(np.mean(n ** 2))
        return (x + n).astype(np.float32)

    def verify(x, y, ctx):
        snr = 10 * np.log10(np.mean(x ** 2) / (np.mean((y - x) ** 2) + 1e-20))
        return abs(snr - snr_db) <= 1.0, round(float(snr), 2)
    return gen, verify


def reverb():
    def gen(x, ctx):
        y = _through_files(x, lambda s, d: [['sox', str(s), str(d), 'reverb', '60', '50', '100', '100', '20', '0']])
        return y[:len(x)].astype(np.float32)

    def verify(x, y, ctx):
        c = np.corrcoef(x.mean(1), y.mean(1))[0, 1]
        return c < 0.995, round(float(c), 4)
    return gen, verify


def bar_shuffle():
    def gen(x, ctx):
        bpm, first = ctx.get('grid_bpm'), ctx.get('first_beat_s')
        if not bpm or first is None:
            raise NotApplicable('no beat grid')
        bar = int(round(4 * 60.0 / bpm * SR))
        start = int(round((first % (4 * 60.0 / bpm)) * SR))
        bars = [x[start + i * bar:start + (i + 1) * bar] for i in range((len(x) - start) // bar)]
        if len(bars) < 4:
            raise NotApplicable('fewer than 4 whole bars')
        order = np.random.default_rng(ctx['seed']).permutation(len(bars))
        while np.all(order == np.arange(len(bars))):
            order = np.roll(order, 1)
        ctx['_order'] = order
        return np.concatenate([x[:start]] + [bars[i] for i in order] + [x[start + len(bars) * bar:]]).astype(np.float32)

    def verify(x, y, ctx):
        return len(x) == len(y) and not np.allclose(x, y), int(len(ctx.get('_order', [])))
    return gen, verify


def reverse():
    def gen(x, ctx):
        return x[::-1].copy()

    def verify(x, y, ctx):
        return bool(np.allclose(x[::-1], y)), 0
    return gen, verify


class NotApplicable(Exception):
    pass


def catalogue():
    """(group, name, (gen, verify)) for every Part 2 change except the stem ones."""
    out = [('baseline', 'none', (lambda x, ctx: x, lambda x, y, ctx: (True, 0)))]
    out += [('control', 'stretch+0.1%', stretch(0.1)), ('control', 'pitch+0.02st', pitch(0.02)),
            ('control', 'rubberband-fine+0.1%', rubberband_fine_control())]
    out += [('tempo-key', f'stretch{p:+d}%', stretch(p)) for p in (-8, -4, -2, 2, 4, 8)]
    out += [('tempo-key', f'pitch{s:+d}st', pitch(s)) for s in (-3, -2, -1, 1, 2, 3)]
    out += [('tempo-key', f'varispeed{p:+d}%', varispeed(p)) for p in (-8, -4, 4, 8)]
    out += [('quality', f'mp3-{k}k', codec('mp3', k)) for k in (320, 192, 128, 96, 64)]
    out += [('quality', 'aac-128k', codec('aac', 128))]
    out += [('quality', 'resample-22k', resample(22050))]
    out += [('quality', f'noise-white-{s}dB', noise('white', s)) for s in (30, 15)]
    out += [('quality', f'noise-vinyl-{s}dB', noise('vinyl', s)) for s in (30, 15)]
    out += [('mix', f'lowpass-{h // 1000}k', lowpass(h)) for h in (4000, 8000, 12000)]
    out += [('mix', f'highpass-{h}', highpass(h)) for h in (60, 120, 250)]
    out += [('mix', f'eq-{b}{d:+d}dB', eq(b, d)) for b in EQ_BANDS for d in (-6, 6)]
    out += [('mix', 'limit+12dB', limit()), ('mix', 'mono', mono()), ('mix', 'reverb', reverb())]
    out += [('structure', 'bar-shuffle', bar_shuffle()), ('structure', 'reverse', reverse())]
    return out
