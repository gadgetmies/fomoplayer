"""Audio embeddings with the Discogs-EffNet model.

One code path for every embedding the analyser stores: track previews
(`main.py`), uploaded notification samples (`main.py --audio-samples`) and the
embedding service (`embedding_service.py`). Sounds like compares sample
embeddings with preview embeddings, so they must come from identical steps:
decode to WAV, load mono at 16 kHz, run the model, average the per-patch rows.
"""

import os

from essentia.standard import MonoLoader, TensorflowPredictEffnetDiscogs

from audio_decode import to_wav

DEFAULT_MODEL = 'discogs_multi_embeddings-effnet-bs64-1'
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')


def build_model(model_name=DEFAULT_MODEL):
    graph_filename = os.path.join(MODELS_DIR, f"{model_name}.pb")
    return TensorflowPredictEffnetDiscogs(graphFilename=graph_filename, output="PartitionedCall:1")


def compute_temporal_embedding(wav_path, model):
    """Load audio at 16kHz and run the model, returning the (n_patches, 1280)
    per-patch temporal embedding matrix."""
    audio = MonoLoader(filename=wav_path, sampleRate=16000, resampleQuality=4)()
    return model(audio)


def embed_wav(wav_path, model):
    """Embedding vector (1280 floats) of a WAV file, or None when the audio is
    too short for a single model patch."""
    embeddings = compute_temporal_embedding(wav_path, model)
    if len(embeddings) == 0:
        return None
    return embeddings.T.mean(1).tolist()


def embed_file(path, model, work_dir):
    """Embedding vector of any audio file ffmpeg can decode, or None when it is
    too short. A `.wav` is read as-is, as uploaded samples always were;
    anything else is decoded to a WAV in `work_dir` first."""
    if os.path.splitext(path)[1].lower() == '.wav':
        return embed_wav(path, model)
    wav_path = os.path.join(work_dir, os.path.splitext(os.path.basename(path))[0] + '.decoded.wav')
    try:
        return embed_wav(to_wav(path, wav_path), model)
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)
