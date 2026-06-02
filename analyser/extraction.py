"""Extraction helpers shared between the production analyser worker and the
sample-matching evaluation harness.

These helpers used to live in `analyser/panako_processor.py`. They are
defined here so a one-shot consumer (the eval) can import them without
loading `panako_processor.py`'s module-level OAuth/IO side effects.
`analyser/panako_processor.py` re-exports the same names for backwards
compatibility.
"""

import datetime
import hashlib
import json
import os
import shutil
import stat
import subprocess
import time
import traceback
import urllib.parse
import urllib.request

import requests


def compute_file_hash(file_path):
    """Compute SHA256 hash of a file for comparison."""
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()


def ensure_downloads_directory():
    """Ensure the downloads directory exists under analyser."""
    downloads_dir = os.path.join(os.path.dirname(__file__), 'downloads')
    os.makedirs(downloads_dir, exist_ok=True)
    return downloads_dir


def ensure_panako_db_directory():
    """Ensure the Panako database directory exists under analyser."""
    db_dir = os.path.join(os.path.dirname(__file__), 'panako_db')
    os.makedirs(db_dir, exist_ok=True)
    return os.path.abspath(db_dir)


def cleanup_downloads(downloads_dir):
    """Remove every regular file directly under `downloads_dir`.

    Subdirectories, symlinks, sockets, and other non-regular entries are
    skipped. Per-entry failures are caught and counted; this function never
    raises into the caller's `finally:`. Prints a one-line summary before
    returning.
    """
    removed = 0
    errors = 0
    if not os.path.isdir(downloads_dir):
        print(f"[cleanup] downloads/: directory not present, nothing to do")
        return
    try:
        entries = os.listdir(downloads_dir)
    except OSError as e:
        print(f"[cleanup] downloads/: could not list directory: {e}")
        return
    for name in entries:
        path = os.path.join(downloads_dir, name)
        try:
            st = os.lstat(path)
        except OSError:
            errors += 1
            continue
        if not stat.S_ISREG(st.st_mode):
            continue
        try:
            os.remove(path)
            removed += 1
        except OSError:
            errors += 1
    print(f"[cleanup] downloads/: removed {removed} files, {errors} errors")


def cleanup_panako_worker_dirs(analyser_root):
    """Remove every top-level `panako_db_worker_*/` directory under
    `analyser_root`.

    The shared `panako_db/` cache is NOT removed (the trailing underscore in
    the `panako_db_worker_` prefix guards against that match). Non-directory
    entries with the prefix are skipped. Per-entry failures are caught and
    counted; this function never raises into the caller's `finally:`. Prints
    a one-line summary before returning.
    """
    removed = 0
    errors = 0
    if not os.path.isdir(analyser_root):
        print(f"[cleanup] worker dirs: directory not present, nothing to do")
        return
    try:
        entries = os.listdir(analyser_root)
    except OSError as e:
        print(f"[cleanup] worker dirs: could not list directory: {e}")
        return
    for name in entries:
        if not name.startswith('panako_db_worker_'):
            continue
        path = os.path.join(analyser_root, name)
        if not os.path.isdir(path) or os.path.islink(path):
            continue
        try:
            shutil.rmtree(path)
            removed += 1
        except OSError:
            errors += 1
    print(f"[cleanup] worker dirs: removed {removed}, {errors} errors")


def download_and_manage_file(url, file_id, file_type, filename=None, downloads_dir=None):
    """Download `url` into `downloads_dir` and return the final file path (str).

    Relies on the invariant that `cleanup_downloads` is run at the end of
    each invocation, so `target_path` is not present when this function
    starts. That removes the need for hash-compare or
    rename-with-counter branches.
    """
    if downloads_dir is None:
        downloads_dir = ensure_downloads_directory()

    if filename:
        file_ext = os.path.splitext(filename)[1]
    else:
        url_path = urllib.parse.urlparse(url).path
        file_ext = os.path.splitext(url_path)[1]
        if not file_ext:
            file_ext = '.mp3'

    target_filename = f"{file_type}_{file_id}{file_ext}"
    target_path = os.path.join(downloads_dir, target_filename)

    temp_download_path = os.path.join(downloads_dir, f"{target_filename}.tmp")

    print(f"Downloading {file_type} with id {file_id} from: {url}")
    urllib.request.urlretrieve(url, temp_download_path)

    if not os.path.exists(temp_download_path):
        raise RuntimeError(f"Downloaded file does not exist: {temp_download_path}")

    file_size = os.path.getsize(temp_download_path)
    if file_size == 0:
        os.remove(temp_download_path)
        raise RuntimeError(f"Downloaded file is empty: {temp_download_path}")

    print(f"Downloaded to: {temp_download_path} (size: {file_size} bytes)")

    os.rename(temp_download_path, target_path)
    print(f"Saved to: {target_path}")
    return target_path


def log_panako_call(cmd, result, command_name="Panako"):
    """Log a Panako command call with its results."""
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {command_name} command:")
    print(f"  Command: {' '.join(cmd)}")
    print(f"  Return code: {result.returncode}")
    if result.stdout:
        print(f"  Stdout: {result.stdout[:500]}{'...' if len(result.stdout) > 500 else ''}")
    if result.stderr:
        print(f"  Stderr: {result.stderr[:500]}{'...' if len(result.stderr) > 500 else ''}")


def blocks_to_seconds(t1_blocks):
    # Panako 2.1 defaults (~/.panako/config.properties):
    # PANAKO_TRANSF_TIME_RESOLUTION = 128, PANAKO_SAMPLE_RATE = 16000.
    # Previously hardcoded 2048/11025 here gave positions ~23x the real
    # duration; verified empirically against the fixtures in analyser/data.
    time_resolution = 128.0
    sample_rate = 16000.0
    return t1_blocks * (time_resolution / sample_rate)


def read_tdb_file(tdb_path):
    """
    Read a Panako .tdb file and extract fingerprints directly.
    Format: fingerprintHash resourceIdentifier t1 f1

    Returns a list of dictionaries with 'hash', 'position', and 'f1' keys.
    """
    fingerprints = []
    if not os.path.exists(tdb_path):
        return fingerprints

    try:
        with open(tdb_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = line.split()
                if len(parts) >= 4:
                    try:
                        hash_val = int(parts[0])
                        resource_id = int(parts[1])
                        t1_blocks = int(parts[2])
                        f1 = int(parts[3])

                        # Convert t1 blocks to seconds for position
                        position = blocks_to_seconds(t1_blocks)

                        fingerprint = {
                            'hash': hash_val,
                            'position': position,
                            'f1': f1
                        }
                        fingerprints.append(fingerprint)
                    except (ValueError, IndexError) as e:
                        print(f"Warning: Could not parse line in .tdb file: {line[:100]}")
                        continue
    except Exception as e:
        print(f"Warning: Error reading .tdb file {tdb_path}: {e}")

    return fingerprints


# Panako CLI arguments used by the production extractor. Exposed as a
# constant so callers (e.g. the eval cache) can derive a key that
# invalidates whenever the extraction parameters change.
PANAKO_CONFIG_ARGS = (
    'STRATEGY=PANAKO',
    'PANAKO_STORAGE=FILE',
)

PANAKO_STORE_EXTRA_ARGS = (
    'CHECK_DUPLICATE_FILE_NAMES=FALSE',
)


def get_panako_config_args(db_path=None):
    """Return the panako config args used by extract_panako_fingerprints.

    `db_path` is the resolved PANAKO_CACHE_FOLDER. Pass None to get the
    args without the cache folder (useful for cache-key hashing where the
    cache folder is operator-specific).
    """
    args = list(PANAKO_CONFIG_ARGS)
    if db_path is not None:
        args.append(f'PANAKO_CACHE_FOLDER={db_path}')
    return args


def extract_panako_fingerprints(audio_path):
    """
    Extract Panako fingerprints from an audio file.
    This function uses Panako's command-line interface to extract fingerprints.
    Returns a list of dictionaries with 'hash', 'position', and 'f1' keys.

    Note: Panako must be installed and available in PATH.
    See https://github.com/JorenSix/Panako for installation instructions.
    """
    try:
        db_path = ensure_panako_db_directory()

        if not os.path.exists(db_path):
            raise RuntimeError(f"Failed to create database directory: {db_path}")

        audio_path_abs = os.path.abspath(audio_path)
        if not os.path.exists(audio_path_abs):
            raise RuntimeError(f"Audio file does not exist: {audio_path_abs}")

        panako_config_args = get_panako_config_args(db_path)

        resolve_cmd = ['panako', 'resolve', audio_path_abs] + panako_config_args
        resolve_result = subprocess.run(resolve_cmd, capture_output=True, text=True, check=False)
        log_panako_call(resolve_cmd, resolve_result, "Panako resolve (check existing)")

        if resolve_result.returncode == 0:
            resolve_output = resolve_result.stdout.strip()
            if resolve_output:
                file_ids = [line.strip() for line in resolve_output.split('\n') if line.strip()]
                if file_ids:
                    print(f"File already exists in database with ID(s): {', '.join(file_ids)}, deleting...")
                    delete_cmd = ['panako', 'delete', audio_path_abs] + panako_config_args
                    delete_result = subprocess.run(delete_cmd, capture_output=True, text=True, check=False)
                    log_panako_call(delete_cmd, delete_result, "Panako delete")
                    if delete_result.returncode != 0:
                        print(f"Warning: Failed to delete file from database")

        store_cmd = ['panako', 'store', audio_path_abs] + list(PANAKO_STORE_EXTRA_ARGS) + panako_config_args
        store_result = subprocess.run(store_cmd, capture_output=True, text=True, check=False)
        log_panako_call(store_cmd, store_result, "Panako store")

        if store_result.returncode != 0:
            raise RuntimeError(f"Panako store failed: {store_result.stderr}")

        # Get file ID after storing
        resolve_cmd = ['panako', 'resolve', audio_path_abs] + panako_config_args
        resolve_result = subprocess.run(resolve_cmd, capture_output=True, text=True, check=False)
        log_panako_call(resolve_cmd, resolve_result, "Panako resolve (get ID)")

        if resolve_result.returncode != 0:
            raise RuntimeError(f"Panako resolve failed: {resolve_result.stderr}")

        resolve_output = resolve_result.stdout.strip()
        if not resolve_output:
            print(f"Warning: Could not resolve file ID for {audio_path}")
            return []

        file_ids = [line.strip() for line in resolve_output.split('\n') if line.strip()]
        if not file_ids:
            print(f"Warning: Could not parse file ID from resolve output: {resolve_output}")
            return []

        file_id = file_ids[0]

        # Read fingerprints directly from .tdb file
        # Panako FILE storage uses PANAKO_CACHE_FOLDER for .tdb files
        tdb_path = os.path.join(db_path, f"{file_id}.tdb")

        # Wait for .tdb file to be created (Panako writes it during processStoreQueue)
        # Give it a moment to ensure the file is written to disk
        max_retries = 20
        retry_delay = 0.1  # 100ms
        file_found = False
        for attempt in range(max_retries):
            if os.path.exists(tdb_path):
                file_size = os.path.getsize(tdb_path)
                # Check if file has content (not just created empty)
                if file_size > 0:
                    file_found = True
                    break
            if attempt < max_retries - 1:
                time.sleep(retry_delay)

        if not file_found:
            # Enhanced error reporting
            if os.path.exists(tdb_path):
                file_size = os.path.getsize(tdb_path)
                print(f"Warning: .tdb file exists but is empty: {tdb_path} (size: {file_size} bytes)")
            else:
                print(f"Warning: .tdb file does not exist after {max_retries * retry_delay:.1f}s: {tdb_path}")
                print(f"  Expected location: {tdb_path}")
                print(f"  Cache folder: {db_path}")
                print(f"  File ID: {file_id}")
                # List files in cache folder for debugging
                if os.path.exists(db_path):
                    files_in_dir = os.listdir(db_path)
                    tdb_files = [f for f in files_in_dir if f.endswith('.tdb')]
                    print(f"  .tdb files in cache folder: {tdb_files[:10]}")  # Show first 10 .tdb files
                    if not tdb_files:
                        print(f"  No .tdb files found in cache folder")
                        print(f"  All files in folder: {files_in_dir[:20]}")  # Show first 20 files
                else:
                    print(f"  Cache folder does not exist: {db_path}")
            return []

        fingerprints = read_tdb_file(tdb_path)

        if not fingerprints:
            print(f"Warning: Could not parse fingerprints from .tdb file: {tdb_path}")
            return []

        print(f"Extracted {len(fingerprints)} fingerprints directly from .tdb file")
        return fingerprints
    except FileNotFoundError:
        error_msg = (
            "Panako command not found. Please install Panako and ensure it's in your PATH.\n"
            "See https://github.com/JorenSix/Panako for installation instructions.\n"
            "Alternatively, you can use Panako's Python bindings if available."
        )
        print(error_msg)
        raise RuntimeError(error_msg)
    except subprocess.CalledProcessError as e:
        error_msg = f"Error running Panako: {e.stderr}\nCommand: {' '.join(e.cmd) if hasattr(e, 'cmd') else 'unknown'}\nStdout: {e.stdout}"
        print(error_msg)
        raise RuntimeError(error_msg)
    except Exception as e:
        error_msg = f"Error extracting fingerprints: {e}"
        print(error_msg)
        print(traceback.format_exc())
        raise


# --------------------- parallel preview fingerprinting --------------------
#
# These primitives back the parallel `panako_processor.py --previews` path.
# They live here (not in `panako_processor.py`) so the pool worker
# `fingerprint_preview_subbatch` imports only side-effect-free modules
# (`extraction` + lazy `auth`), keeping it safe under `spawn`, where the OS
# re-imports the worker's module in every child process.


def _worker_cache_dir():
    """Per-worker Panako cache folder, isolated by PID so LMDB writes never
    contend across concurrent worker processes. Reused across batches within
    one worker."""
    cache_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        f'panako_db_worker_{os.getpid()}',
    )
    os.makedirs(cache_dir, exist_ok=True)
    return os.path.abspath(cache_dir)


def _batched_panako_store(audio_paths, cache_dir):
    """Run `panako store` then `panako resolve` on a batch of files in a
    single JVM invocation each, against an isolated `cache_dir`. Returns a
    parallel list of Panako file IDs (one per input path, same order).

    Because `cache_dir` starts empty per worker, no per-file
    `resolve → delete` dedup is needed — the batch always stores fresh."""
    panako_args = list(PANAKO_CONFIG_ARGS) + [f'PANAKO_CACHE_FOLDER={cache_dir}']
    store_cmd = ['panako', 'store', *audio_paths, *PANAKO_STORE_EXTRA_ARGS, *panako_args]
    store_result = subprocess.run(store_cmd, capture_output=True, text=True, check=False)
    if store_result.returncode != 0:
        raise RuntimeError(
            f'panako batch store failed (rc={store_result.returncode}): '
            f'{store_result.stderr[:500]}'
        )

    resolve_cmd = ['panako', 'resolve', *audio_paths, *panako_args]
    resolve_result = subprocess.run(resolve_cmd, capture_output=True, text=True, check=False)
    if resolve_result.returncode != 0:
        raise RuntimeError(
            f'panako batch resolve failed (rc={resolve_result.returncode}): '
            f'{resolve_result.stderr[:500]}'
        )

    ids = [line.strip() for line in resolve_result.stdout.strip().split('\n') if line.strip()]
    if len(ids) != len(audio_paths):
        raise RuntimeError(
            f'panako resolve returned {len(ids)} ids for {len(audio_paths)} files'
        )
    return ids


def upload_preview_fingerprints(preview_id, fingerprints):
    """POST a preview's fingerprints to the backend exact-match endpoint.

    Import-safe: depends only on `requests` and a lazily-imported `auth`
    (which does no import-time work), so this module stays usable by
    side-effect-free consumers and safe to import inside a `spawn`ed
    worker."""
    from auth import auth_header, get_api_url, request_error

    data = {
        "preview_id": preview_id,
        "fingerprints": fingerprints,
    }

    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] Uploading preview fingerprints:")
    print(f"  Preview ID: {preview_id}")
    print(f"  Number of fingerprints: {len(fingerprints)}")
    if fingerprints:
        print(f"  Sample fingerprint: {fingerprints[0]}")
    print(f"  Payload size: {len(json.dumps(data))} bytes")

    res = requests.post(
        f"{get_api_url()}/admin/exact-match/previews/fingerprints",
        headers=auth_header(),
        json=data,
    )
    if res.status_code != 200:
        raise Exception(request_error("Upload fingerprints request", res))
    return res.json()


def _preview_to_wav(downloaded_path, preview_id, downloads_dir):
    """mp3/mpeg/lofi/extensionless → wav, wav passthrough, else raise.

    Mirrors the proven worker conversion in `run_fingerprint_and_report.py`.
    Beatport's `.LOFI` (and some extensionless) preview files are mp3-format
    despite the extension, so they decode via `from_file`."""
    file_ext = os.path.splitext(downloaded_path)[1].lower()
    if file_ext in ('.mp3', '.mpeg', '.lofi', ''):
        from pydub import AudioSegment
        sound = AudioSegment.from_file(downloaded_path)
        wav_filename = os.path.join(downloads_dir, f"preview_{preview_id}.wav")
        sound.export(wav_filename, format='wav')
        if not os.path.exists(wav_filename) or os.path.getsize(wav_filename) == 0:
            raise RuntimeError(f"Wav conversion failed: {wav_filename}")
        return wav_filename
    if file_ext == '.wav':
        return downloaded_path
    raise RuntimeError(f"Unsupported file format: {file_ext}")


def fingerprint_preview_subbatch(jobs):
    """Spawn-safe pool worker: fingerprint a sub-batch of previews and upload.

    `jobs` is a list of `{'id': preview_id, 'url': url}` dicts (optional
    `'filename'`). Runs in three phases with isolated failures:

      Phase A — per-file download + wav-convert; one bad file is recorded as
                a failure and does not stop the others.
      Phase B — one batched `panako store` + `resolve` over the prepared
                files in this worker's isolated per-PID cache.
      Phase C — per-file `.tdb` read + `upload_preview_fingerprints`, each
                wrapped so one upload failure does not sink the rest.

    Returns one `{'id', 'fp_count', 'error'}` dict per input job. `error` is
    `None` on success. Imports only `extraction` + lazy `auth`, so it is safe
    to run under `ProcessPoolExecutor` with the `spawn` start method."""
    cache_dir = _worker_cache_dir()
    downloads_dir = ensure_downloads_directory()
    results = []
    prepared = []

    # Phase A: per-file download + wav-convert. Failures don't sink the batch.
    for job in jobs:
        try:
            downloaded_path = download_and_manage_file(
                job['url'], job['id'], 'preview', job.get('filename'), downloads_dir,
            )
            audio_path = _preview_to_wav(downloaded_path, job['id'], downloads_dir)
            if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
                raise RuntimeError(f'audio missing/empty: {audio_path}')
            prepared.append({'id': job['id'], 'audio_path': os.path.abspath(audio_path)})
        except Exception as e:  # noqa: BLE001
            results.append({'id': job['id'], 'fp_count': 0, 'error': f'prep: {e}'[:200]})

    if not prepared:
        return results

    # Phase B: one batched Panako store+resolve over the prepared files.
    try:
        file_ids = _batched_panako_store([p['audio_path'] for p in prepared], cache_dir)
    except Exception as e:  # noqa: BLE001
        results.extend(
            {'id': p['id'], 'fp_count': 0, 'error': f'batch: {e}'[:200]}
            for p in prepared
        )
        return results

    # Phase C: read each .tdb + upload. Per-file try/except isolates failures.
    for p, fid in zip(prepared, file_ids):
        tdb_path = os.path.join(cache_dir, f'{fid}.tdb')
        for _ in range(20):
            if os.path.exists(tdb_path) and os.path.getsize(tdb_path) > 0:
                break
            time.sleep(0.1)
        try:
            fingerprints = read_tdb_file(tdb_path)
            upload_preview_fingerprints(p['id'], fingerprints)
            results.append({'id': p['id'], 'fp_count': len(fingerprints), 'error': None})
        except Exception as e:  # noqa: BLE001
            results.append({'id': p['id'], 'fp_count': 0, 'error': f'upload: {e}'[:200]})
    return results
