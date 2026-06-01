from dotenv import load_dotenv

load_dotenv()

import argparse
import json
import os
import requests
import traceback
from pydub import AudioSegment
from auth import auth_header, get_api_url, request_error
import sys
import datetime

# Re-export extraction helpers from analyser.extraction so existing imports
# (`from panako_processor import extract_panako_fingerprints`, etc.) keep
# working after the refactor that moved these into a shared module.
from extraction import (  # noqa: F401  (re-exported for compatibility)
    blocks_to_seconds,
    compute_file_hash,
    download_and_manage_file,
    ensure_downloads_directory,
    ensure_panako_db_directory,
    extract_panako_fingerprints,
    log_panako_call,
    read_tdb_file,
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


def upload_preview_fingerprints(preview_id, fingerprints):
    data = {
        "preview_id": preview_id,
        "fingerprints": fingerprints
    }
    
    # Log upload request payload
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] Uploading preview fingerprints:")
    print(f"  Preview ID: {preview_id}")
    print(f"  Number of fingerprints: {len(fingerprints)}")
    if fingerprints:
        sample_fp = fingerprints[0]
        print(f"  Sample fingerprint: {sample_fp}")
    print(f"  Payload size: {len(json.dumps(data))} bytes")

    res = requests.post(
        f"{get_api_url()}/admin/exact-match/previews/fingerprints",
        headers=auth_header(),
        json=data
    )
    if res.status_code != 200:
        raise Exception(request_error("Upload fingerprints request", res))
    return res.json()


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


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--previews", action="store_true", help="Process store track previews")
    ap.add_argument("-a", "--audio-samples", action="store_true", help="Process uploaded audio samples")
    ap.add_argument("-b", "--batch-size", type=int, default=10, help="Batch size for processing")
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

    if args.audio_samples:
        samples_to_process = get_next_audio_samples_to_fingerprint(batch_size=args.batch_size)
        print(f"Got {len(samples_to_process)} audio samples")

        if len(samples_to_process) == 0:
            print("No audio samples to process")
            sys.exit(2)

        downloads_dir = ensure_downloads_directory()
        for sample in samples_to_process:
            sample_url = sample.get("url")
            sample_id = sample.get("id")
            filename = sample.get("filename")

            try:
                downloaded_path, needs_reprocess = download_and_manage_file(
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

                if needs_reprocess:
                    print(f"File matches existing, reprocessing in Panako: {audio_path}")

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
        previews_to_process = get_next_previews_to_fingerprint(batch_size=args.batch_size)
        print(f"Got {len(previews_to_process)} previews")

        if len(previews_to_process) == 0:
            print("No previews to process")
            sys.exit(2)

        # Counter for interleaved sample scoring. With batch_size < score_after,
        # this will never reach the threshold within a single invocation — the
        # operator is expected to either (a) use --batch-size >= --score-after,
        # or (b) accept that scoring only runs when explicitly invoked.
        previews_fingerprinted_this_run = 0
        previews_since_last_score = 0

        downloads_dir = ensure_downloads_directory()
        for preview in previews_to_process:
            preview_url = preview.get("url")
            preview_id = preview.get("preview_id") or preview.get("id")
            filename = preview.get("filename")

            try:
                downloaded_path, needs_reprocess = download_and_manage_file(
                    preview_url, preview_id, "preview", filename, downloads_dir
                )
                
                file_ext_lower = os.path.splitext(downloaded_path)[1].lower()
                if file_ext_lower in ['.mp3', '.mpeg']:
                    print("Converting mp3 to wav")
                    if not os.path.exists(downloaded_path) or os.path.getsize(downloaded_path) == 0:
                        print(f"Error: MP3 file is missing or empty before conversion: {downloaded_path}")
                        continue
                    
                    sound = AudioSegment.from_mp3(downloaded_path)
                    wav_filename = os.path.join(downloads_dir, f"preview_{preview_id}.wav")
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

                if needs_reprocess:
                    print(f"File matches existing, reprocessing in Panako: {audio_path}")

                print(f"Extracting Panako fingerprints from: {audio_path}")
                fingerprints = extract_panako_fingerprints(audio_path)
                print(f"Extracted {len(fingerprints)} fingerprints")

                print(f"Uploading fingerprints for preview {preview_id}")
                upload_preview_fingerprints(preview_id, fingerprints)
                print(f"Successfully uploaded fingerprints for preview {preview_id}")

                previews_fingerprinted_this_run += 1
                previews_since_last_score += 1

                if args.score_after > 0 and previews_since_last_score >= args.score_after:
                    run_server_side_scoring(
                        reason=f"reached {previews_fingerprinted_this_run} previews fingerprinted this run "
                               f"(score-after={args.score_after})"
                    )
                    previews_since_last_score = 0

            except Exception as e:
                print(f"Error processing preview {preview_id}: {e}")
                print(traceback.format_exc())

    print("Processing completed successfully")

