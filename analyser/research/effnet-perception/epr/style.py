"""Discogs style probabilities (400 styles) per Part 1 track: the mean over patches of the sigmoid outputs of
discogs-effnet-bs64-1. Optional: skipped with a reason when the model is not in OUT/models."""
import json

import numpy as np

from . import audio, sample
from .config import STYLE_GRAPH, STYLE_LABELS, out_path
from .steps import Step

STEP = 'style'
_model = None


def available():
    return STYLE_GRAPH.exists() and STYLE_LABELS.exists()


def labels():
    return json.loads(STYLE_LABELS.read_text())['classes']


def path(track_id):
    return out_path(STEP, 'means', f'{track_id}.npy')


def _work(t):
    global _model
    if _model is None:
        import essentia.standard as es
        _model = es.TensorflowPredictEffnetDiscogs(graphFilename=str(STYLE_GRAPH), output='PartitionedCall:0')
    p = np.asarray(_model(audio.load_mono16k(t['track_path'])))
    np.save(path(t['track_id']), p.mean(0).astype(np.float32))
    names = labels()
    top = np.argsort(-p.mean(0))[:3]
    return [{'track_id': t['track_id'], 'top_styles': '; '.join(f'{names[i]} {p.mean(0)[i]:.2f}' for i in top)}]


def run(workers=3):
    step = Step(STEP)
    if not available():
        step.fail('model', f'{STYLE_GRAPH} not found; style representation skipped')
        return step.summary()
    step.run(sample.read('part1'), _work, key=lambda t: t['track_id'], workers=workers)
    return step.summary()
