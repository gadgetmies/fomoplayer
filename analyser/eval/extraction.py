"""Eval-side wrapper around `analyser.extraction` with an opt-in cache.

The eval uses the same Panako extractor as the production analyser
worker (`extract_panako_fingerprints` in `analyser/extraction.py`),
but adds:

- A unified `extract(audio_url, cache_dir=None)` entry point that
  handles download + mp3→wav conversion + extraction.
- An opt-in JSON cache keyed by `sha256(file) ⊕ sha256(panako CLI args)`,
  so toggling Panako args automatically invalidates stale cache entries.

The cache is intentionally NOT enabled by default. The honest run (with
extraction included) is what surfaces extraction-side regressions; the
cache is reserved for fast threshold sweeps once extraction is known
good.
"""

import hashlib
import json
import os
import sys
import tempfile
import urllib.parse
import urllib.request

# Allow both `python -m analyser.eval.extraction` (package import) and
# `python -m eval.extraction` from analyser/ (sibling import).
try:
    from analyser.extraction import (
        PANAKO_CONFIG_ARGS,
        PANAKO_STORE_EXTRA_ARGS,
        compute_file_hash,
        extract_panako_fingerprints,
    )
except ImportError:  # pragma: no cover - import-path shim
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from extraction import (  # type: ignore[no-redef]
        PANAKO_CONFIG_ARGS,
        PANAKO_STORE_EXTRA_ARGS,
        compute_file_hash,
        extract_panako_fingerprints,
    )


def panako_args_fingerprint():
    """Stable hash of the Panako CLI args used by extract_panako_fingerprints.

    Excludes PANAKO_CACHE_FOLDER (operator-specific path; doesn't change
    extraction output). Any change to STRATEGY, storage, or store-extra
    args invalidates the cache automatically.
    """
    canonical = "\n".join(
        sorted(list(PANAKO_CONFIG_ARGS) + list(PANAKO_STORE_EXTRA_ARGS))
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _cache_key(file_sha256):
    return hashlib.sha256(
        f"{file_sha256}:{panako_args_fingerprint()}".encode("utf-8")
    ).hexdigest()


def _read_cache(cache_dir, key):
    path = os.path.join(cache_dir, f"{key}.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    return [(int(h), float(t1)) for h, t1 in payload.get("fingerprints", [])]


def _write_cache(cache_dir, key, fingerprints):
    os.makedirs(cache_dir, exist_ok=True)
    final_path = os.path.join(cache_dir, f"{key}.json")
    tmp_fd, tmp_path = tempfile.mkstemp(
        prefix=f".{key}.", suffix=".tmp", dir=cache_dir
    )
    try:
        with os.fdopen(tmp_fd, "w") as f:
            json.dump(
                {"fingerprints": [[h, t1] for h, t1 in fingerprints]},
                f,
            )
        os.replace(tmp_path, final_path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def _download(url, dest_dir):
    """Download `url` to a file under `dest_dir`. Returns the file path.

    Preserves the URL's extension when present; otherwise assumes .mp3.
    """
    parsed = urllib.parse.urlparse(url)
    ext = os.path.splitext(parsed.path)[1] or ".mp3"
    # Encode the URL path so the destination filename is unique per URL
    # but stable across runs.
    name = hashlib.sha256(url.encode("utf-8")).hexdigest()[:32]
    dest = os.path.join(dest_dir, f"{name}{ext}")
    if not os.path.exists(dest) or os.path.getsize(dest) == 0:
        urllib.request.urlretrieve(url, dest)
    if not os.path.exists(dest) or os.path.getsize(dest) == 0:
        raise RuntimeError(f"Downloaded file is missing or empty: {dest}")
    return dest


def _ensure_wav(path, dest_dir):
    """Convert mp3 to wav if needed; returns the path to a wav file."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".wav":
        return path
    if ext not in (".mp3", ".mpeg"):
        raise RuntimeError(f"Unsupported audio extension: {ext}")
    from pydub import AudioSegment

    sound = AudioSegment.from_mp3(path)
    wav_name = os.path.splitext(os.path.basename(path))[0] + ".wav"
    wav_path = os.path.join(dest_dir, wav_name)
    sound.export(wav_path, format="wav")
    if not os.path.exists(wav_path) or os.path.getsize(wav_path) == 0:
        raise RuntimeError(f"Converted WAV is missing or empty: {wav_path}")
    return wav_path


def extract(audio_url, cache_dir=None, downloads_dir=None):
    """Extract panako fingerprints for `audio_url`, optionally cached.

    Returns a list of `(hash, t1_seconds)` tuples — positions are in
    seconds because `analyser.extraction.extract_panako_fingerprints`
    converts t1 blocks → seconds via `blocks_to_seconds` before
    returning.

    When `cache_dir` is None, the call always downloads + decodes +
    invokes Panako. When set, the JSON cache at `cache_dir/<key>.json`
    is consulted (key = SHA256 of file ⊕ SHA256 of Panako CLI args)
    and populated atomically on miss.

    A per-file SHA256 read happens even on a cache hit, because the
    cache must be invalidated when the file at `audio_url` changes.
    """
    if downloads_dir is None:
        # Use the analyser's downloads directory so the production
        # extractor + the eval share the same on-disk staging area.
        downloads_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "downloads",
        )
    os.makedirs(downloads_dir, exist_ok=True)

    downloaded = _download(audio_url, downloads_dir)
    file_sha = compute_file_hash(downloaded)

    if cache_dir is not None:
        key = _cache_key(file_sha)
        cached = _read_cache(cache_dir, key)
        if cached is not None:
            return cached

    wav_path = _ensure_wav(downloaded, downloads_dir)
    raw = extract_panako_fingerprints(wav_path)
    # `extract_panako_fingerprints` returns dicts with 'hash'/'position'/'f1'.
    # The scorer wants (hash, t1) tuples where t1 is in seconds.
    fingerprints = [(int(fp["hash"]), float(fp["position"])) for fp in raw]

    if cache_dir is not None:
        _write_cache(cache_dir, _cache_key(file_sha), fingerprints)

    return fingerprints
