import numpy as np
import pytest

from epr import transforms

SR = transforms.SR


@pytest.fixture(autouse=True)
def out_dir(tmp_path, monkeypatch):
    import epr.config as config
    monkeypatch.setattr(config, 'OUT', tmp_path.resolve())


def music(seconds=6, seed=0):
    """Harmonic tones on a 128 BPM pulse plus a little noise: enough for pitch, tempo and band checks."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * SR)) / SR
    x = sum(np.sin(2 * np.pi * f * t) / (i + 1) for i, f in enumerate((220, 330, 440, 554.4, 660, 880, 1320)))
    env = 0.6 + 0.4 * (np.sin(2 * np.pi * (128 / 60) * t) > 0)
    x = x * env + 0.05 * rng.standard_normal(len(t))
    x = 0.2 * x / np.max(np.abs(x))
    return np.stack([x, x * 0.9], axis=1).astype(np.float32)


@pytest.mark.parametrize('semitones', [-2, 1, 3])
def test_pitch_shift_is_measured(semitones):
    x = music()
    gen, verify = transforms.pitch(semitones)
    y = gen(x, {})
    ok, measured = verify(x, y, {})
    assert ok, measured
    assert abs(measured - semitones) <= 0.25


@pytest.mark.parametrize('pct', [-8, 4])
def test_stretch_changes_duration_only(pct):
    x = music()
    gen, verify = transforms.stretch(pct)
    y = gen(x, {})
    assert verify(x, y, {})[0]
    assert abs(transforms.pitch_shift_measured(x, y)) <= 0.25


def test_varispeed_moves_tempo_and_pitch():
    x = music()
    gen, verify = transforms.varispeed(8)
    y = gen(x, {})
    ok, measured = verify(x, y, {})
    assert ok, measured


def test_lowpass_removes_highs():
    x = music() + np.random.default_rng(1).standard_normal((6 * SR, 2)).astype(np.float32) * 0.05
    gen, verify = transforms.lowpass(4000)
    assert verify(x, gen(x, {}), {})[0]


def test_eq_changes_band_by_requested_gain():
    x = np.random.default_rng(2).standard_normal((6 * SR, 2)).astype(np.float32) * 0.1
    gen, verify = transforms.eq('presence', 6)
    ok, measured = verify(x, gen(x, {}), {})
    assert ok, measured


@pytest.mark.parametrize('name,kbps', [('mp3', 64), ('aac', 128)])
def test_codec_round_trip_keeps_alignment(name, kbps):
    x = music()
    gen, verify = transforms.codec(name, kbps)
    y = gen(x, {})
    assert y.shape == x.shape
    ok, corr = verify(x, y, {})
    assert ok, corr


def test_noise_hits_requested_snr():
    x = music()
    gen, verify = transforms.noise('white', 15)
    ok, snr = verify(x, gen(x, {'seed': 3}), {'seed': 3})
    assert ok, snr


def test_bar_shuffle_keeps_length_and_needs_grid():
    x = music(seconds=12)
    gen, verify = transforms.bar_shuffle()
    with pytest.raises(transforms.NotApplicable):
        gen(x, {'seed': 1, 'grid_bpm': None, 'first_beat_s': None})
    ctx = {'seed': 1, 'grid_bpm': 128.0, 'first_beat_s': 0.1}
    y = gen(x, ctx)
    assert verify(x, y, ctx)[0]


def test_mono_is_invisible_to_the_downmix():
    x = music()
    gen, verify = transforms.mono()
    y = gen(x, {})
    assert verify(x, y, {})[0]
    np.testing.assert_allclose(y.mean(1), x.mean(1), atol=1e-6)


def test_limiter_lowers_the_crest_factor_and_respects_the_ceiling():
    x = music()
    gen, verify = transforms.limit()
    y = gen(x, {})
    ok, crest_drop = verify(x, y, {})
    assert ok, crest_drop
    assert np.max(np.abs(y)) <= 0.98 + 1e-6


def test_near_zero_controls_pass_their_verifiers():
    x = music()
    for gen, verify in (transforms.stretch(0.1), transforms.pitch(0.02)):
        assert verify(x, gen(x, {}), {})[0]
