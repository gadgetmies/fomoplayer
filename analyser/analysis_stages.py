"""The analyses of the combined preview worker (`analyse_previews.py`).

Each function runs in a worker process of its own stage (started with
`spawn`), on a WAV the coordinator decoded once for every analysis. Imports
are lazy so a process only loads what its stage needs: the embedding process
loads ONNX Runtime and the model once, the waveform process matplotlib and the
bucket client, the fingerprint processes only `extraction`.

The analyses compute exactly what the separate workers compute:
- embedding: `embedding.embed_file`, as `main.py` does;
- waveform: `waveform.generate_waveform` + `upload_waveform`;
- fingerprints: `extraction.fingerprint_prepared` on at most
  `PREVIEW_MAX_DURATION_S` of the WAV, as `_preview_to_wav` decodes it; the
  coordinator uploads them (`upload_fingerprints`), so the WAV is released
  when Panako is done rather than when the upload is.
"""

import os
import shutil
import wave

_model = None


def init_embedding(model_name):
    """Process initializer of the embedding stage: build the model once."""
    global _model
    from embedding import build_model
    _model = build_model(model_name)


def embed(wav_path):
    """Embedding vector of the WAV, or None when it is too short for a single
    model patch. Returns `(vector, duration_s)`; the duration is only read for
    too-short audio, for the log."""
    from audio_decode import wav_duration_seconds
    from embedding import embed_file
    vector = embed_file(wav_path, _model)
    if vector is None:
        return None, wav_duration_seconds(wav_path)
    return vector, None


def init_waveform():
    """Process initializer of the waveform stage: `waveform` connects to the
    bucket on import and exits when it is missing, which breaks the pool."""
    import waveform  # noqa: F401


def render_waveform(wav_path, png_path):
    """Draw the waveform of the WAV and upload it. Returns its URL."""
    import waveform
    try:
        waveform.generate_waveform(wav_path, png_path)
        return waveform.upload_waveform(png_path)
    finally:
        if os.path.exists(png_path):
            os.remove(png_path)


def capped_wav(src, dst, max_seconds):
    """`src` itself when it is at most `max_seconds` long, else `dst` holding
    its first `max_seconds`: the same samples `to_wav(..., max_seconds=...)`
    decodes, without decoding again."""
    with wave.open(src, 'rb') as reader:
        rate = reader.getframerate()
        max_frames = int(round(max_seconds * rate))
        if reader.getnframes() <= max_frames:
            return src
        with wave.open(dst, 'wb') as writer:
            writer.setparams(reader.getparams())
            remaining = max_frames
            while remaining > 0:
                frames = reader.readframes(min(remaining, 1 << 16))
                if not frames:
                    break
                writer.writeframes(frames)
                remaining -= len(frames) // (reader.getsampwidth() * reader.getnchannels())
    return dst


def fingerprint_chunk(jobs):
    """Fingerprint a chunk of WAVs (`{'id', 'wav'}` dicts) in one Panako
    store + resolve. Each chunk gets a fresh cache folder, removed
    afterwards, so a long-running process does not grow it. Returns one
    `{'id', 'fp_count', 'error', 'fingerprints'}` dict per job (no
    `fingerprints` on error); nothing is uploaded."""
    import extraction
    cache_dir = extraction._worker_cache_dir()
    shutil.rmtree(cache_dir, ignore_errors=True)
    os.makedirs(cache_dir)
    try:
        prepared, results = [], []
        for job in jobs:
            try:
                audio_path = capped_wav(job['wav'], os.path.join(cache_dir, f"capped_{job['id']}.wav"),
                                        extraction.PREVIEW_MAX_DURATION_S)
                prepared.append({'id': job['id'], 'audio_path': os.path.abspath(audio_path)})
            except Exception as e:  # noqa: BLE001
                results.append({'id': job['id'], 'fp_count': 0, 'error': f'prep: {e}'[:200]})
        if prepared:
            results += extraction.fingerprint_prepared(prepared, cache_dir, upload=False)
        return results
    finally:
        shutil.rmtree(cache_dir, ignore_errors=True)


def upload_fingerprints(preview_id, fingerprints):
    """Upload one preview's fingerprints; runs on the coordinator's upload
    thread. `upload_preview_fingerprints` holds the machine-wide
    `.upload_lock`, so uploads stay one at a time across all workers."""
    import extraction
    extraction.upload_preview_fingerprints(preview_id, fingerprints)
