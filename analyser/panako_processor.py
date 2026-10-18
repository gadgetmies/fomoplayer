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

import bandcamp

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


# Previews whose extraction legitimately yields zero fingerprints (e.g.
# 3-second Beatport stubs) get no meta row from the deployed backend, so the
# without-fingerprint queue re-serves them forever and they slowly clog the
# newest-first queue top. Until the backend fix (meta row with count 0 in
# upsertPreviewFingerprints) is deployed, remember them locally and filter
# them out of each fetched batch. Harmless after the deploy: the queue stops
# returning them and the skiplist goes inert.
ZERO_FP_SKIPLIST_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'zero_fingerprint_previews.txt'
)


def load_zero_fp_skiplist():
    try:
        with open(ZERO_FP_SKIPLIST_PATH) as f:
            return {line.strip() for line in f if line.strip()}
    except FileNotFoundError:
        return set()


def append_zero_fp_skiplist(preview_ids):
    if not preview_ids:
        return
    with open(ZERO_FP_SKIPLIST_PATH, 'a') as f:
        for pid in preview_ids:
            f.write(f"{pid}\n")


def get_next_previews_to_fingerprint(batch_size=10):
    print("Getting next previews to fingerprint")
    res = requests.get(
        f"{get_api_url()}/admin/exact-match/previews/without-fingerprint?limit={batch_size}",
        headers=auth_header(),
        # No timeout hangs the whole drain on one dropped connection
        # (observed 2026-10-15: 4 workers pinned for 9+ hours).
        timeout=60,
    )
    if res.status_code != 200:
        raise Exception(request_error("Next previews request", res))
    return _parse_json_or_explain("Next previews request", res)


def get_next_audio_samples_to_fingerprint(batch_size=10):
    print("Getting next audio samples to fingerprint")
    res = requests.get(
        f"{get_api_url()}/admin/exact-match/audio-samples/without-fingerprint?limit={batch_size}",
        headers=auth_header(),
        timeout=60,
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
        json=data,
        # Server cuts the response at its 25s connect-timeout anyway; the
        # timeout guards against silently-dropped connections, not slowness.
        timeout=120,
    )
    if res.status_code != 200:
        raise Exception(request_error("Upload fingerprints request", res))
    return res.json()


def mark_previews_missing(preview_ids):
    """Flag previews the store no longer streams via POST /admin/analyse —
    the same endpoint/path the embeddings worker uses, whose `missing`
    entries end up in markPreviewsMissing (store__track_preview_missing)."""
    res = requests.post(
        f"{get_api_url()}/admin/analyse",
        headers=auth_header(),
        json=[{"preview_id": pid, "missing": True} for pid in preview_ids],
        timeout=60,
    )
    if res.status_code != 200:
        raise Exception(request_error("Mark previews missing request", res))


def resolve_bandcamp_url(preview):
    """Look up the stream URL of a Bandcamp preview (full track).

    Returns the URL, None when Bandcamp has no stream for the track (the
    preview should then be marked missing), or False after a transient
    failure, so the preview stays in the queue for a later run. Mirrors
    `resolve_bandcamp_url` in main.py (embeddings worker)."""
    for attempt in range(2):
        try:
            return bandcamp.resolve_stream_url(
                preview.get("release_url"), preview.get("store_track_id")
            )
        except bandcamp.RateLimited as e:
            print(f"{e}; pausing for {bandcamp.RATE_LIMIT_PAUSE_S} s", flush=True)
            if attempt == 0:
                time.sleep(bandcamp.RATE_LIMIT_PAUSE_S)
        except requests.RequestException as e:
            print(f"Resolving Bandcamp stream for preview {preview.get('preview_id')} failed: {e}")
            return False
    return False


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
        res = requests.post(endpoint, headers=auth_header(), json={}, timeout=600)
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


def process_previews(batch_size, workers, score_after, jobs_file=None):
    """Fetch one batch of previews and fingerprint them in parallel.

    Splits the fetched batch into at most `workers` sub-batches and runs each
    in its own process (isolated Panako cache) via a `ProcessPoolExecutor`.
    Tallies successful uploads as sub-batches complete and fires cumulative
    server-side scoring. Returns the process exit code (2 = empty queue, so
    the `analyse_all.sh` loop can stop; 0 = work done).

    `jobs_file` names a JSON file with the batch to process instead of the
    without-fingerprint queue: a list of {preview_id, url?, store_track_id?,
    release_url?} objects, the same shape the queue endpoint serves. Used to
    feed Bandcamp previews (whose URLs the deployed endpoint doesn't serve)
    from a direct DB export."""
    # Over-fetch by the skiplist size: skiplisted previews can occupy at most
    # len(skiplist) slots of the response, so this still yields a full batch
    # of fingerprintable previews whenever the queue has that many.
    skiplist = load_zero_fp_skiplist()
    if jobs_file:
        with open(jobs_file) as f:
            fetched = json.load(f)
        previews_to_process = [
            p for p in fetched
            if str(p.get('preview_id') or p.get('id')) not in skiplist
        ]
    else:
        fetched = get_next_previews_to_fingerprint(batch_size=batch_size + len(skiplist))
        previews_to_process = [
            p for p in fetched
            if str(p.get('preview_id') or p.get('id')) not in skiplist
        ][:batch_size]
    skipped = len(fetched) - len(previews_to_process)
    print(f"Got {len(previews_to_process)} previews" +
          (f" ({skipped} skiplisted/over-fetched filtered out)" if skipped else ""))

    if len(previews_to_process) == 0:
        if jobs_file and skipped:
            # The jobs file HAD previews but every one was skiplisted — the
            # queue is not empty, the export just served only known
            # zero-fingerprint previews (seen 2026-10-17). rc=2 here would
            # make the driver loop think it drained; back off instead.
            print("All jobs skiplisted; not an empty queue")
            return 1
        print("No previews to process")
        return 2

    # Bandcamp previews come without a stored URL (their stream URLs expire);
    # resolve them here, sequentially — bandcamp.py's rate limiter and
    # per-release cache are per-process state, so resolution must not move
    # into the worker pool. Previews Bandcamp no longer streams are marked
    # missing; transient failures stay queued for a later run.
    resolved_jobs = []
    gone_ids = []
    deferred = 0
    for p in previews_to_process:
        pid = p.get('preview_id') or p.get('id')
        if p.get('url'):
            resolved_jobs.append(p)
            continue
        if not p.get('release_url'):
            deferred += 1
            continue
        stream_url = resolve_bandcamp_url(p)
        if stream_url:
            resolved_jobs.append({**p, 'url': stream_url, 'filename': f"{pid}.mp3"})
        elif stream_url is None:
            gone_ids.append(pid)
        else:
            deferred += 1
    if gone_ids:
        try:
            mark_previews_missing(gone_ids)
            print(f"Marked {len(gone_ids)} unstreamable preview(s) missing: {gone_ids}")
        except Exception as e:  # noqa: BLE001
            print(f"Could not mark previews missing ({e}); they will be refetched")
    if deferred:
        print(f"{deferred} preview(s) deferred to a later run (unresolved URL)")
    previews_to_process = resolved_jobs

    if len(previews_to_process) == 0:
        # Progress was still made if something was marked missing; otherwise
        # exit non-zero so the driver loop backs off instead of spinning.
        return 0 if gone_ids else 1

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
                zero_fp_ids = [
                    r['id'] for r in sub_results
                    if r['error'] is None and r.get('fp_count') == 0
                ]
                if zero_fp_ids:
                    append_zero_fp_skiplist(zero_fp_ids)
                    print(
                        f"    skiplisted {len(zero_fp_ids)} zero-fingerprint "
                        f"preview(s): {zero_fp_ids}"
                    )
                yield sub_results

    def _score(cumulative_threshold):
        run_server_side_scoring(
            reason=f"reached {cumulative_threshold} cumulative previews "
                   f"fingerprinted this run (score-after={score_after})"
        )

    total = _tally_and_score(_completed_results(), score_after, _score)
    print(f"Fingerprinted {total} previews successfully this run")
    if total == 0:
        # Every preview in the batch failed (e.g. a broken java runtime makes
        # `panako store` fail instantly). Returning 0 here made the driver
        # loop refetch and refail the same batch forever with no visible
        # error; a non-zero exit lets the loop back off and the operator see.
        print("All previews in this batch failed - exiting non-zero so the driver loop backs off")
        return 1
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
    ap.add_argument("--jobs-file", type=str, default=None,
                    help="When --previews: read the batch from this JSON file (a list of "
                         "{preview_id, url?, store_track_id?, release_url?} objects) instead "
                         "of the without-fingerprint queue. Used to feed Bandcamp previews "
                         "from a direct DB export; see drain_bandcamp.sh.")
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
                jobs_file=args.jobs_file,
            )
            if rc != 0:
                sys.exit(rc)

        print("Processing completed successfully")
    finally:
        cleanup_downloads(downloads_dir)

