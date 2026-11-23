"""Audio embeddings with the shared `track_embedding` package.

One code path for every embedding the analyser stores: track previews
(`main.py`, `analyse_previews.py`), uploaded notification samples
(`main.py --audio-samples`) and the embedding service (`embedding_service.py`).
Sounds like compares sample embeddings with preview embeddings, so they must
come from identical steps; those steps are the shared specification
`track-embedding/1` (FFmpeg 16-bit decode at the source rate, channel mean,
libsamplerate linear resample to 16 kHz, log-mel front-end, Discogs-EffNet in
ONNX form, mean over patches), which Harmonia computes the same way. Version 1
reproduces the vectors stored before the analyser used the package, which came
from Essentia's MonoLoader + TensorflowPredictEffnetDiscogs.
"""

import os

import track_embedding

from audio_decode import AudioDecodeError

# The type stored in the database (`*_embedding_type`) and reported by the
# workers. Each stored type is one version of the shared specification; the
# back end's EMBEDDING_VERSIONS (routes/shared/embedding-versions.js) holds the
# same mapping.
DEFAULT_MODEL = 'discogs_multi_embeddings-effnet-bs64-1'
EMBEDDING_VERSIONS = {DEFAULT_MODEL: track_embedding.VERSION}

MODELS_DIR = os.environ.get('TRACK_EMBEDDING_MODELS_DIR') or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'models')
MODEL_FILE = f'{DEFAULT_MODEL}.onnx'


def ensure_models(models_dir=MODELS_DIR):
    """Download the model files into `models_dir` when they are missing.

    The model is MTG's Discogs-EffNet, licensed CC BY-NC-SA 4.0
    (non-commercial; see models/README.md). Fomo Player has used it under that
    licence since 2025, so its operator has accepted it. The package checks
    the download's size and sha256, and every load's sha256, against its
    manifest.
    """
    if os.path.exists(os.path.join(models_dir, MODEL_FILE)):
        return
    print(f'Downloading the embedding model into {models_dir} '
          f'({track_embedding.LICENCE_SUMMARY})', flush=True)
    track_embedding.download_models(models_dir, licence_accepted=True)


def build_model(model_name=DEFAULT_MODEL, models_dir=None, threads=None):
    """The embedding model, loaded once and reused for every file. Only the
    types listed in EMBEDDING_VERSIONS can be computed."""
    if model_name not in EMBEDDING_VERSIONS:
        raise ValueError(f'Unknown embedding model {model_name!r}; '
                         f'known: {", ".join(sorted(EMBEDDING_VERSIONS))}')
    models_dir = models_dir or MODELS_DIR
    ensure_models(models_dir)
    return track_embedding.Embedder(models_dir, threads=threads)


def embed_file(path, model):
    """Embedding vector (1280 floats) of any audio file FFmpeg can decode, or
    None when the audio is too short for a single model patch (about 2 s).
    Raises AudioDecodeError with FFmpeg's message when the file cannot be
    decoded."""
    try:
        samples = track_embedding.decode(path)
    except track_embedding.DecodeError as e:
        raise AudioDecodeError(f'ffmpeg could not decode {path}: {e}') from e
    try:
        return model(samples).tolist()
    except track_embedding.AudioTooShortError:
        return None
