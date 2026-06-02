from dotenv import load_dotenv

load_dotenv()

import argparse
import json
import os
import requests
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from pydub import AudioSegment
from auth import auth_header, get_api_url, request_error
import sys
import datetime

# Re-export extraction helpers from analyser.extraction so existing imports
# (`from panako_processor import extract_panako_fingerprints`, etc.) keep
# working after the refactor that moved these into a shared module. The
# parallel-preview primitives (`_worker_cache_dir`, `_batched_panako_store`,
# `fingerprint_preview_subbatch`) and `upload_preview_fingerprints` also live
# in `extraction.py` now and are re-exported here for backwards compatibility.
from extraction import (  # noqa: F401  (re-exported for compatibility)
    blocks_to_seconds,
    cleanup_downloads,
    cleanup_panako_worker_dirs,
    compute_file_hash,
    download_and_manage_file,
    ensure_downloads_directory,
    ensure_panako_db_directory,
    extract_panako_fingerprints,
    fingerprint_preview_subbatch,
    log_panako_call,
    read_tdb_file,
    upload_preview_fingerprints,
    _batched_panako_store,
    _worker_cache_dir,
)

def _parse_json_or_explain(action, res):
    """Return res.json(), or raise with status + body excerpt on parse failure.

    Saves operators from opaque `JSONDecodeError: Expecting value: line 1
    column 1 (char 0)` tracebacks when the backend returns an empty body or
    an unexpected response (e.g. HTML from a misconfigured reverse proxy).
    """
    try:
        return res.json()
    except ValueError:
        body_excerpt = (res.text or "")[:500]
        raise Exception(
            f"{action}: backend returned status {res.status_code} with "
            f"non-JSON body (length {len(res.text or '')}): {body_excerpt!r}"
        )


def get_next_previews_to_fingerprint(batch_size=10):
    print("Getting next previews to fingerprint")
    res = requests.get(
        f"{get_api_url()}/admin/exact-match/previews/without-fingerprint?limit={batch_size}",
        headers=auth_header()
    )
    if res.status_code != 200:
        raise Exception(request_error("Next previews request", res))
    return _parse_json_or_explain("Next previews request", res)


def get_next_audio_samples_to_fingerprint(batch_size=10):
    print("Getting next audio samples to fingerprint")
    res = requests.get(
        f"{get_api_url()}/admin/exact-match/audio-samples/without-fingerprint?limit={batch_size}",
        headers=auth_header()
    )
    if res.status_code != 200:
        raise Exception(request_error("Next audio samples request", res))
    return _parse_json_or_explain("Next audio samples request", res)


def upload_sample_fingerprints(sample_id, fingerprints):
    data = {
        "sample_id": sample_id,
        "fingerprints": fingerprints
    }
    
    # Log upload request payload
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] Uploading audio sample fingerprints:")
    print(f"  Sample ID: {sample_id}")
    print(f"  Number of fingerprints: {len(fingerprints)}")
    if fingerprints:
        sample_fp = fingerprints[0]
        print(f"  Sample fingerprint: {sample_fp}")
    print(f"  Payload size: {len(json.dumps(data))} bytes")

    res = requests.post(
        f"{get_api_url()}/admin/exact-match/audio-samples/fingerprints",
        headers=auth_header(),
        json=data
    )
    if res.status_code != 200:
        raise Exception(request_error("Upload fingerprints request", res))
    return res.json()


def run_server_side_scoring(reason):
    """POST the bulk scoring endpoint, log one summary line per sample.

    The endpoint scores every sample with fingerprints, persists each
    sample's matches into `user_notification_audio_sample_match`, and
    returns a per-sample status. A 404 means the endpoint is not deployed
    yet — log it and return without raising so the fingerprint loop keeps
    going.

    Returns (ok_count, fail_count).
    """
    endpoint = f"{get_api_url()}/admin/exact-match/audio-samples/matches"
    print(f"[scoring] {reason} — POSTing {endpoint} (server scores every sample with fingerprints)")
    try:
        res = requests.post(endpoint, headers=auth_header(), json={})
    except Exception as e:
        print(f"[scoring] Could not reach scoring endpoint: {e}. Skipping scoring pass.")
        return (0, 0)

    if res.status_code == 404:
        print(
            f"[scoring] {endpoint} returned 404 — the bulk scoring endpoint is "
            "not deployed yet. Skipping scoring pass; re-run after the backend "
            "roll-out."
        )
        return (0, 0)

    if res.status_code != 200:
        print(f"[scoring] Scoring request failed: {request_error('Bulk scoring request', res)}")
        return (0, 0)

    payload = _parse_json_or_explain("Bulk scoring request", res)
    results = payload.get("results") or []
    ok = payload.get("ok_count", 0)
    failed = payload.get("fail_count", 0)
    print(f"[scoring] Server scored {len(results)} samples ({ok} ok, {failed} failed)")
    for r in results:
        sid = r.get("sample_id")
        fname = r.get("filename") or ""
        if r.get("status") == "ok":
            count = r.get("match_count", 0)
            top_score = r.get("top_score")
            print(
                f"[scoring]   sample {sid} ({fname}): {count} match(es)"
                + (f", top score={top_score}" if top_score is not None else "")
            )
        else:
            print(f"[scoring]   sample {sid} ({fname}): FAILED — {r.get('error')}")
    return (ok, failed)


def _split_into_chunks(items, n):
    """Split `items` into at most `n` contiguous, near-equal sub-batches.

    Fewer than `n` chunks are returned when `len(items) < n` (no empty
    chunks). With `n <= 1` the whole list is one chunk — the single-worker
    path still goes through the parallel code (one batched Panako call), not
    a serial per-file fallback."""
    if n <= 1 or len(items) <= 1:
        return [items]
    n = min(n, len(items))
    k, m = divmod(len(items), n)
    chunks = []
    start = 0
    for i in range(n):
        size = k + (1 if i < m else 0)
        chunks.append(items[start:start + size])
        start += size
    return chunks


def _tally_and_score(completed_results, score_after, score_fn):
    """Tally successful uploads across completed sub-batch result lists and
    fire `score_fn(cumulative_threshold)` once each time the cumulative
    successful-upload count crosses a multiple of `score_after`.

    `completed_results` is an iterable of per-sub-batch result lists in
    completion (arrival) order. The cumulative total is order-independent,
    and because scoring is a single global server sweep, firing per boundary
    crossed is correct regardless of the order sub-batches finish in. With
    `score_after <= 0` no scoring fires. Returns total successful uploads."""
    total_uploaded = 0
    milestones_fired = 0
    for sub_results in completed_results:
        total_uploaded += sum(1 for r in sub_results if r.get('error') is None)
        if score_after > 0:
            while total_uploaded // score_after > milestones_fired:
                milestones_fired += 1
                score_fn(milestones_fired * score_after)
    return total_uploaded


def process_previews(batch_size, workers, score_after):
    """Fetch one batch of previews and fingerprint them in parallel.

    Splits the fetched batch into at most `workers` sub-batches and runs each
    in its own process (isolated Panako cache) via a `ProcessPoolExecutor`.
    Tallies successful uploads as sub-batches complete and fires cumulative
    server-side scoring. Returns the process exit code (2 = empty queue, so
    the `analyse_all.sh` loop can stop; 0 = work done)."""
    previews_to_process = get_next_previews_to_fingerprint(batch_size=batch_size)
    print(f"Got {len(previews_to_process)} previews")

    if len(previews_to_process) == 0:
        print("No previews to process")
        return 2

    jobs = [
        {
            'id': p.get('preview_id') or p.get('id'),
            'url': p.get('url'),
            'filename': p.get('filename'),
        }
        for p in previews_to_process
    ]
    sub_batches = _split_into_chunks(jobs, workers)
    print(
        f"Fingerprinting {len(jobs)} previews across {len(sub_batches)} "
        f"sub-batch(es) (workers={workers})"
    )
    start = time.time()

    def _completed_results():
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(fingerprint_preview_subbatch, sb): i
                for i, sb in enumerate(sub_batches, 1)
            }
            for completed_n, fut in enumerate(as_completed(futures), 1):
                idx = futures[fut]
                try:
                    sub_results = fut.result()
                except Exception as e:  # noqa: BLE001
                    print(f"  sub-batch {idx} crashed: {e}")
                    continue
                ok = sum(1 for r in sub_results if r['error'] is None)
                fail = len(sub_results) - ok
                print(
                    f"  sub-batch {completed_n}/{len(sub_batches)} done "
                    f"({len(sub_results)} previews, {ok} ok, {fail} failed) "
                    f"| {time.time() - start:.0f}s elapsed"
                )
                for r in sub_results:
                    if r['error']:
                        print(f"    preview {r['id']} failed: {r['error']}")
                yield sub_results

    def _score(cumulative_threshold):
        run_server_side_scoring(
            reason=f"reached {cumulative_threshold} cumulative previews "
                   f"fingerprinted this run (score-after={score_after})"
        )

    total = _tally_and_score(_completed_results(), score_after, _score)
    print(f"Fingerprinted {total} previews successfully this run")
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--previews", action="store_true", help="Process store track previews")
    ap.add_argument("-a", "--audio-samples", action="store_true", help="Process uploaded audio samples")
    ap.add_argument("-b", "--batch-size", type=int, default=10, help="Batch size for processing")
    ap.add_argument("--workers", type=int, default=4,
                    help="Parallel worker processes for preview fingerprinting "
                         "(default 4; parallelism is ON by default). Each worker "
                         "runs its own Panako JVM + ffmpeg, so the recommended "
                         "ceiling is cores − 1..2. Use --workers 1 to fingerprint "
                         "the whole fetched batch in a single process (still the "
                         "parallel code path, not a serial per-file fallback). "
                         "Ignored for --audio-samples.")
    ap.add_argument("--score-after", type=int, default=1000,
                    help="When --previews: after every N successfully fingerprinted previews within "
                         "this invocation, pause and run scoring across all samples. 0 disables. "
                         "Note: counter is per-invocation, so requires batch-size >= score-after to "
                         "ever fire from a single batch.")
    args = ap.parse_args()

    if not args.previews and not args.audio_samples:
        print("Please specify either --previews or --audio-samples")
        sys.exit(1)

    print(f"[{datetime.datetime.now()}] Starting Panako fingerprint extraction")

    downloads_dir = ensure_downloads_directory()
    try:
        if args.audio_samples:
            samples_to_process = get_next_audio_samples_to_fingerprint(batch_size=args.batch_size)
            print(f"Got {len(samples_to_process)} audio samples")

            if len(samples_to_process) == 0:
                print("No audio samples to process")
                sys.exit(2)

            for sample in samples_to_process:
                sample_url = sample.get("url")
                sample_id = sample.get("id")
                filename = sample.get("filename")

                try:
                    downloaded_path = download_and_manage_file(
                        sample_url, sample_id, "sample", filename, downloads_dir
                    )

                    file_ext_lower = os.path.splitext(downloaded_path)[1].lower()
                    if file_ext_lower in ['.mp3', '.mpeg']:
                        print("Converting mp3 to wav")
                        if not os.path.exists(downloaded_path) or os.path.getsize(downloaded_path) == 0:
                            print(f"Error: MP3 file is missing or empty before conversion: {downloaded_path}")
                            continue

                        sound = AudioSegment.from_mp3(downloaded_path)
                        wav_filename = os.path.join(downloads_dir, f"sample_{sample_id}.wav")
                        sound.export(wav_filename, format="wav")

                        if not os.path.exists(wav_filename):
                            print(f"Error: Converted WAV file does not exist: {wav_filename}")
                            continue

                        wav_size = os.path.getsize(wav_filename)
                        if wav_size == 0:
                            print(f"Error: Converted WAV file is empty: {wav_filename}")
                            continue

                        print(f"Converted to WAV: {wav_filename} (size: {wav_size} bytes)")
                        audio_path = wav_filename
                    elif file_ext_lower == '.wav':
                        audio_path = downloaded_path
                    else:
                        print(f"Unsupported file format: {file_ext_lower}")
                        continue

                    if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
                        print(f"Error: Audio file is missing or empty before fingerprinting: {audio_path}")
                        continue

                    print(f"Extracting Panako fingerprints from: {audio_path}")
                    fingerprints = extract_panako_fingerprints(audio_path)
                    print(f"Extracted {len(fingerprints)} fingerprints")

                    print(f"Uploading fingerprints for audio sample {sample_id}")
                    upload_sample_fingerprints(sample_id, fingerprints)
                    print(f"Successfully uploaded fingerprints for audio sample {sample_id}")

                except Exception as e:
                    print(f"Error processing sample {sample_id}: {e}")
                    print(traceback.format_exc())

        if args.previews:
            rc = process_previews(
                batch_size=args.batch_size,
                workers=args.workers,
                score_after=args.score_after,
            )
            if rc == 2:
                sys.exit(2)

        print("Processing completed successfully")
    finally:
        cleanup_downloads(downloads_dir)

