"""Full-track per-patch embeddings for the Part 1 sample: OUT/embed-full/patches/<track_id>.npy."""
import numpy as np

from . import audio, embed, sample
from .steps import Step

STEP = 'embed-full'


def _path(track_id):
    from .config import out_path
    return out_path(STEP, 'patches', f'{track_id}.npy')


def load(track_id):
    return np.load(_path(track_id))


def _work(t):
    p = embed.patches(audio.load_mono16k(t['track_path']))
    if p.shape[0] < 10:
        raise ValueError(f'only {p.shape[0]} patches')
    np.save(_path(t['track_id']), p.astype(np.float32))
    return [{'track_id': t['track_id'], 'patches': p.shape[0]}]


def run(workers=3):
    step = Step(STEP)
    step.run(sample.read('part1'), _work, key=lambda t: t['track_id'], workers=workers)
    return step.summary()
