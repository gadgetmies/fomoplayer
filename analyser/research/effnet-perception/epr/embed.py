"""Per-patch Discogs-EffNet embeddings with the analyser's graph."""
import numpy as np

from .config import EFFNET_GRAPH, PATCH_HOP_SECONDS, PATCH_SECONDS

_model = None


def model():
    global _model
    if _model is None:
        import essentia.standard as es
        _model = es.TensorflowPredictEffnetDiscogs(graphFilename=str(EFFNET_GRAPH), output='PartitionedCall:1')
    return _model


def patches(mono16k):
    """(n_patches, 1280) float32 for 16 kHz mono audio."""
    return np.asarray(model()(np.asarray(mono16k, dtype=np.float32)), dtype=np.float32)


def patch_times(n):
    """Start and end (seconds) of each patch."""
    starts = np.arange(n) * PATCH_HOP_SECONDS
    return starts, starts + PATCH_SECONDS


def mean(p):
    return p.mean(axis=0)


def unit(v):
    v = np.asarray(v, dtype=np.float64)
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)


def cos_dist(a, b):
    return 1.0 - float(np.dot(unit(a), unit(b)))
