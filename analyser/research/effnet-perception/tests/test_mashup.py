import numpy as np
import pytest

from epr import audio, mashup

SR = mashup.SR


def parts(n=SR * 4, seed=0):
    rng = np.random.default_rng(seed)
    return {s: (rng.standard_normal((n, 2)) * 0.05).astype(np.float32) for s in ('drums', 'bass', 'other', 'vocals')}


@pytest.mark.parametrize('kind,beats', [('1/16', 0.25), ('beat', 1), ('bar', 4)])
def test_offsets_land_on_the_grid(kind, beats):
    bpm = 174.0
    assert mashup.offset_samples(bpm, kind) == int(round(beats * 60 / bpm * SR))


def test_off_grid_offset_is_37ms():
    assert mashup.offset_samples(174.0, '37ms') == int(round(0.037 * SR))


def test_unshifted_recombination_sums_the_stems():
    p = parts()
    np.testing.assert_allclose(mashup.shifted(p, 'drums', 0), sum(p.values()), atol=1e-6)


def test_shift_moves_only_the_layer():
    p = parts()
    y = mashup.shifted(p, 'music', 1000)
    others = p['drums'] + p['bass']
    np.testing.assert_allclose(y - others, np.roll(p['other'] + p['vocals'], 1000, axis=0), atol=1e-6)


def test_level_matches_host_stem_rms_within_cap():
    rng = np.random.default_rng(1)
    host = (rng.standard_normal((SR, 2)) * 0.1).astype(np.float32)
    donor = (rng.standard_normal((SR, 2)) * 0.05).astype(np.float32)
    levelled, gain = mashup.level_to(donor, host)
    assert abs(audio.rms_db(levelled) - audio.rms_db(host)) < 0.1
    quiet = donor * 1e-4
    _, capped = mashup.level_to(quiet, host)
    assert capped == mashup.LEVEL_CAP_DB


def test_fold_bpm_prefers_half_or_double_time():
    assert mashup.fold_bpm(87, 174) == 174
    assert mashup.fold_bpm(170, 86) == 85
    assert mashup.fold_bpm(128, 130) == 128


def test_region_starts_on_a_bar_line():
    t = {'grid_bpm': 120.0, 'first_beat_ms': 500, 'duration': 300.0}
    start, bars = mashup.region(t, 61.3, 30)
    assert ((start - 0.5) / 2.0) == pytest.approx(round((start - 0.5) / 2.0))
    assert start >= 61.3 and bars == 15
