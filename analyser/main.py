from dotenv import load_dotenv

load_dotenv()


import essentia
import json
import requests
from auth import auth_header, get_api_url, request_error, resolve_url, stored_audio_query
import bandcamp
import prefetch
from analysis_reports import post_analysis

from audio_decode import to_wav, wav_duration_seconds
from embedding import DEFAULT_MODEL, build_model, compute_temporal_embedding, embed_file
from spotipy.oauth2 import SpotifyClientCredentials
import argparse
import contextlib
import hashlib
import os
import shutil
import spotipy
import sys
import taglib
import tempfile
import time
import traceback
import urllib.request
import urllib.parse
import datetime

spotify = spotipy.Spotify(auth_manager=SpotifyClientCredentials())

# Construct the argument parser
ap = argparse.ArgumentParser()

# Add the arguments to the parser
ap.add_argument("-m", "--model", help="Model type (e.g. 'discogs_multi_embeddings-effnet-bs64-1')")
ap.add_argument("-p", "--purchased", help="Analyse purchased tracks")
ap.add_argument("-a", "--audio-samples", action="store_true", help="Process uploaded audio samples instead of store previews")
ap.add_argument("-b", "--batch-size", type=int, default=10, help="Batch size for fetching samples")
ap.add_argument("--direct-download", action="store_true",
                help="Download previews from the stores instead of only taking previews whose audio the "
                     "backend's prefetchPreviewAudio job stored in the bucket")
ap.add_argument("--sanity-window", type=int, default=20,
                help="How many previously generated embeddings to keep on disk and compare against to detect bit-identical duplicates. 0 disables the check.")
ap.add_argument("--skip-sanity-confirmation", action="store_true",
                help="Skip the y/N prompt when an embedding collision is detected; log the warning and continue. Required for unattended runs (e.g. analyse_all.sh).")
ap.add_argument("--loop", action="store_true",
                help="Previews: keep the model loaded and process batches until the queue is empty, then exit 2 "
                     "(or, with --idle-wait, wait and ask again)")
ap.add_argument("--idle-wait", type=float, default=0,
                help="With --loop: when the queue is empty, wait this many seconds and ask again instead of "
                     "exiting, keeping the model loaded. 0 (default) exits 2.")
ap.add_argument("--download-workers", type=int, default=4,
                help="Previews: how many previews stored in our bucket download and decode in parallel while "
                     "the model runs. Previews fetched from a store are always fetched one at a time.")
args = ap.parse_args()


# A stalled download or request must not hang the worker: urlretrieve and
# requests wait forever by default, and a hung download kept the embedding
# worker idle for two hours (2026-11-16) while its tmux pane looked alive.
# The download timeout applies to each wait for data, so a slow but moving
# download still finishes.
DOWNLOAD_TIMEOUT_S = float(os.getenv("ANALYSER_DOWNLOAD_TIMEOUT_S", "60"))
API_TIMEOUT_S = 120


def download(url, path):
    """Download url to path, giving up after DOWNLOAD_TIMEOUT_S without data."""
    with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT_S) as response, open(path, "wb") as out:
        shutil.copyfileobj(response, out)
    return path


from embedding_sanity import EmbeddingSanityChecker


# tracks = glob(args.path + '/**/*.mp3', recursive=True)

def _parse_json_or_explain(action, res):
    """Return res.json(), or raise with status + body excerpt on parse failure."""
    try:
        return res.json()
    except ValueError:
        body_excerpt = (res.text or "")[:500]
        raise Exception(
            f"{action}: backend returned status {res.status_code} with "
            f"non-JSON body (length {len(res.text or '')}): {body_excerpt!r}"
        )


def get_next_analysis_tracks(model=DEFAULT_MODEL, purchased=True, batch_size=10, direct_download=False):
    print("Getting next tracks to analyse")
    print(purchased)
    url = (f"{get_api_url()}/admin/analyse?model={model}&batch_size={batch_size}"
           f"&purchased={'true' if purchased else ''}{stored_audio_query(direct_download)}")
    print(url)
    res = requests.get(
        url,
        headers=auth_header(),
        timeout=API_TIMEOUT_S,
    )
    if (res.status_code != 200):
        raise Exception(request_error("Next tracks request", res))
    return _parse_json_or_explain("Next tracks request", res)


def get_next_audio_samples(batch_size=10):
    print("Getting next audio samples to analyse")
    print(f"{get_api_url()}/admin/notification-audio-samples/without-embedding?limit={batch_size}")
    res = requests.get(
        f"{get_api_url()}/admin/notification-audio-samples/without-embedding?limit={batch_size}",
        headers=auth_header(),
        timeout=API_TIMEOUT_S,
    )
    if (res.status_code != 200):
        raise Exception(request_error("Next audio samples request", res))
    return _parse_json_or_explain("Next audio samples request", res)


def safe_get_first_tag_value(dict, key):
    if (key in dict):
        value = dict[key][0].replace("'", "\''")
        return f"'{value}'"
    else:
        return "null"


def pad_date(date):
    if date == 'null':
        return date
    length = len(date)
    if length == 12:
        return date
    elif length == 9:
        return f"{date[:-1]}-01'"
    elif length == 6:
        return f"{date[:-1]}-01-01'"
    else:
        raise Exception(f"Unexpected date format: {date}")


def get_tag_info(absolute_file_path):
    audiofile = taglib.File(absolute_file_path)
    tags = audiofile.tags
    return {
        'key': safe_get_first_tag_value(tags, "INITIALKEY"),
        'bpm': safe_get_first_tag_value(tags, "BPM"),
        'isrc': safe_get_first_tag_value(tags, "ISRC"),
        'genre': safe_get_first_tag_value(tags, "GENRE"),
        'energy': safe_get_first_tag_value(tags, "ENERGYLEVEL"),
        'date': pad_date(safe_get_first_tag_value(tags, "DATE")),
        'artist': safe_get_first_tag_value(tags, "ARTIST"),
        'title': safe_get_first_tag_value(tags, "TITLE"),
        'album': safe_get_first_tag_value(tags, "ALBUM"),
        'label': safe_get_first_tag_value(tags, "PUBLISHER"),
    }


'''
def get_spotify_details(isrc):
    result = spotify.search(q=f'isrc:{isrc}')
    items = result['tracks']['items']
    if len(items) > 0:
        id = items[0]['id']
        features = spotify.audio_features([id])
        return features[0]
    else:
        return {}
'''

def resolve_bandcamp_url(preview):
    """Look up the stream URL of a Bandcamp preview.

    Returns the URL, None when Bandcamp has no stream for the track (the
    preview is then reported missing), or False after a transient failure, so
    the preview stays in the queue for a later run.
    """
    for attempt in range(2):
        try:
            return bandcamp.resolve_stream_url(preview.get("release_url"), preview.get("store_track_id"))
        except bandcamp.RateLimited as e:
            print(f"{e}; pausing for {bandcamp.RATE_LIMIT_PAUSE_S} s", flush=True)
            if attempt == 0:
                time.sleep(bandcamp.RATE_LIMIT_PAUSE_S)
        except requests.RequestException as e:
            print(f"Resolving Bandcamp stream for preview {preview.get('preview_id')} failed: {e}")
            return False
    return False



# With --loop, a batch that reported nothing, or a failed queue request, is
# followed by this wait so failing items aren't fetched again straight away.
NO_PROGRESS_WAIT_S = float(os.getenv("ANALYSER_NO_PROGRESS_WAIT_S", "60"))


def prepare_track(track, work_dir):
    """Download one preview of `track` and decode it to a WAV in `work_dir`.

    Runs on a prefetch thread while the model works on an earlier track. The
    track's previews are tried in order until one downloads. Returns a dict
    with `missing` (reports for previews the store no longer has), and
    `preview_id` / `wav` of the decoded preview, or `wav` None when none could
    be downloaded or decoded (the track then stays queued). The downloaded
    file is deleted once decoded, so only WAVs waiting for the model take
    disk space.
    """
    track_id = track.get('track_id')
    result = {"missing": [], "preview_id": None, "wav": None}
    for preview in track.get('previews') or []:
        from_cache = False
        previewUrl = preview.get("url")
        previewId = preview.get("preview_id")
        if preview.get("audio_url"):
            # Stored in our bucket by the backend's prefetchPreviewAudio job.
            previewUrl = preview.get("audio_url")
        elif not previewUrl and preview.get("store") == "Bandcamp":
            from_cache = bool(bandcamp.cached_stream_url(preview.get("store_track_id")))
            previewUrl = resolve_bandcamp_url(preview)
            if previewUrl is None:
                print(f"Bandcamp has no stream for preview {previewId}")
                result["missing"].append({"preview_id": previewId, "missing": True})
                continue
            if previewUrl is False:
                continue
        print(f"Downloading preview with id {previewId} from : {previewUrl}")
        mp3_path = os.path.join(work_dir, f"preview_{previewId}")
        try:
            download(resolve_url(previewUrl), mp3_path)
        except Exception as e:
            print(f"Downloading preview failed (preview {previewId}): {e}")
            if os.path.exists(mp3_path):
                os.remove(mp3_path)
            if preview.get("audio_url"):
                # Our own bucket failing is transient: keep the preview queued.
                continue
            if not preview.get("url") and preview.get("store") == "Bandcamp" and from_cache:
                # A cached stream URL may have expired: forget it so the next
                # run looks the release up again, and keep the preview queued.
                bandcamp.forget_stream_url(preview.get("store_track_id"))
                continue
            result["missing"].append({"preview_id": previewId, "missing": True})
            continue
        print(f"Downloaded preview {previewId} to: {mp3_path}")
        try:
            result["wav"] = to_wav(mp3_path, os.path.join(work_dir, f"preview_{previewId}.wav"))
            result["preview_id"] = previewId
        except Exception as e:
            # Not reported: the preview stays queued, as before.
            print(f"Error processing preview {previewId}: {e}")
        finally:
            os.remove(mp3_path)
        return result
    print(f"Failed to find a working preview for track {track_id}")
    return result


def track_uses_store(track):
    """A track whose previews are not all stored in our bucket may contact a
    store (Bandcamp lookups, store downloads): prepare it on the single store
    thread, so store traffic stays one request at a time."""
    return not all(p.get("audio_url") for p in track.get('previews') or [])



def process_preview_batch(tracks_to_process, model, model_name, sanity, work_dir):
    """Embed one batch of tracks and report it. The next tracks download and
    decode on background threads while the model runs on this thread; tracks
    are embedded and reported in queue order. Returns how many reports the
    backend accepted."""
    entries = []
    batch = prefetch.ordered(tracks_to_process, lambda t: prepare_track(t, work_dir), track_uses_store,
                             workers=args.download_workers)
    with contextlib.closing(batch):
        for track, future in batch:
            try:
                prepared = future.result()
            except Exception as e:
                print(f"Preparing track {track.get('track_id')} failed: {e}")
                print(traceback.format_exc())
                continue
            for missing in prepared["missing"]:
                print(f"Reporting track preview missing with id: {missing['preview_id']}")
            entries.extend(prepared["missing"])
            wav_path = prepared["wav"]
            if wav_path is None:
                continue
            preview_id = prepared["preview_id"]
            try:
                print(f"Processing preview {preview_id}: {wav_path}")
                embeddings = compute_temporal_embedding(wav_path, model)
                if len(embeddings) == 0:
                    # Too short for a single model patch (e.g. one-shots in a
                    # Bandcamp sample pack). Report it missing so it leaves the
                    # queue instead of being retried in every batch.
                    print(f"Audio too short to embed ({wav_duration_seconds(wav_path):.1f} s), "
                          f"reporting preview {preview_id} missing")
                    entries.append({"preview_id": preview_id, "missing": True})
                else:
                    vector = embeddings.T.mean(1).tolist()
                    track_id = track.get('track_id')
                    label = f"track_id={track_id}" if track_id is not None else None
                    if not sanity.record_and_check(preview_id, vector, label=label, group_key=track_id):
                        # Report what was done before stopping.
                        post_analysis(entries)
                        sys.exit(1)
                    print(f"Processing done for preview with id: {preview_id}")
                    entries.append({"id": preview_id,
                                    "embeddings": json.dumps(vector),
                                    "model": model_name,
                                    "spotify": {}})
            except Exception as e:
                print(f"Error processing {wav_path}")
                print(e)
                print(traceback.format_exc())
            finally:
                try:
                    os.remove(wav_path)
                except OSError as e:
                    print(f"Failed removing temp file: {e}")
    return post_analysis(entries)


if __name__ == '__main__':
    # Each embedding makes Essentia warn 'No network created, or last created
    # network has been deleted...' about 2,000 times, which buries the
    # worker's own output (the embedding service silences it the same way).
    # Its errors stay on.
    essentia.log.warningActive = False
    print(f"[{datetime.datetime.now()}] Starting")

    sanity = EmbeddingSanityChecker(args.sanity_window, args.skip_sanity_confirmation)

    if args.audio_samples:
        # Process uploaded audio samples
        samples_to_process = get_next_audio_samples(batch_size=args.batch_size)
        print(f"Got {len(samples_to_process)} audio samples")

        if (len(samples_to_process) == 0):
            print("No audio samples to process")
            sys.exit(2)

        samples = []

        with tempfile.TemporaryDirectory() as temp_dir_name:
            for sample in samples_to_process:
                sampleUrl = sample.get("url")
                sampleId = sample.get("id")
                filename = sample.get("filename")
                
                # Determine file extension from filename or URL
                if filename:
                    file_ext = os.path.splitext(filename)[1]
                else:
                    # Fallback: try to get extension from URL
                    url_path = urllib.parse.urlparse(sampleUrl).path
                    file_ext = os.path.splitext(url_path)[1]
                    if not file_ext:
                        # Default to .mp3 if no extension found
                        file_ext = '.mp3'
                
                # Create a filename with the proper extension in the temp directory
                temp_filename = os.path.join(temp_dir_name, f"sample_{sampleId}{file_ext}")
                
                print(f"Downloading audio sample with id {sampleId} from : {sampleUrl}")
                try:
                    download(resolve_url(sampleUrl), temp_filename)
                    print(f"Downloaded to: {temp_filename}")
                    samples.append({
                        "id": sampleId,
                        "url": sampleUrl,
                        "path": temp_filename,
                        "filename": filename,
                        "missing": False
                    })
                except Exception as e:
                    print("Downloading audio sample failed")
                    samples.append({
                        "id": sampleId,
                        "filename": filename,
                        "missing": True
                    })
                    print(e)

            # Build the model once and reuse it across the batch.
            model_name = args.model or DEFAULT_MODEL
            print("Preparing model")
            model = build_model(model_name)

            for sample in samples:
                if (sample['missing']):
                    print(f"Skipping missing audio sample with id: {sample['id']}")
                    continue
                else:
                    absolute_file_path = sample.get("path").replace("'", "\''")
                    try:
                        print(f"Processing: {absolute_file_path}")

                        print("Processing audio")
                        vector = embed_file(absolute_file_path, model, temp_dir_name)
                        if vector is None:
                            print(f"Audio sample {sample['id']} is too short to embed, skipping")
                            continue

                        label = f"filename={sample['filename']}" if sample.get("filename") else None
                        if not sanity.record_and_check(sample.get("id"), vector, label=label):
                            sys.exit(1)

                        print(f"Processing done, sending details for audio sample with id: {sample.get('id')}")
                        data = [{
                            "id": sample.get("id"),
                            "embeddings": json.dumps(vector),
                            "model": model_name,
                            "missing": False
                        }]
                        res = requests.post(f"{get_api_url()}/admin/notification-audio-samples/embeddings",
                                            headers=auth_header(),
                                            json=data,
                                            timeout=API_TIMEOUT_S)
                        if res.status_code != 200:
                            print(f"Error reporting results for {sample['id']}")
                            print(f"Status code: {res.status_code}")
                            print(res.text)
                    except Exception as e:
                        print(f"Error processing {absolute_file_path}")
                        print(e)
                        print(traceback.format_exc())

                    print("Cleaning up temp files")
                    try:
                        if os.path.exists(absolute_file_path):
                            os.remove(absolute_file_path)
                    except Exception as e:
                        print("Failed removing temp file")
                        print(e)
    else:
        # Process store track previews. With --loop the model stays loaded and
        # batches are processed until the queue is empty.
        purchased = args.purchased is not None
        model_name = args.model or DEFAULT_MODEL
        model = None
        while True:
            # Cached release pages hold stream URLs that expire; keep them for one batch only.
            bandcamp._release_cache.clear()
            try:
                tracks_to_process = get_next_analysis_tracks(purchased=purchased, batch_size=args.batch_size,
                                                             direct_download=args.direct_download)
            except requests.RequestException as e:
                if not args.loop:
                    raise
                print(f"Fetching the queue failed: {e!r}; retrying in {NO_PROGRESS_WAIT_S} s", flush=True)
                time.sleep(NO_PROGRESS_WAIT_S)
                continue
            print(f"[{datetime.datetime.now()}] Got {len(tracks_to_process)} tracks", flush=True)

            if len(tracks_to_process) == 0:
                if args.loop and args.idle_wait > 0:
                    print(f"No tracks to process, checking again in {args.idle_wait:g} s", flush=True)
                    time.sleep(args.idle_wait)
                    continue
                print("No tracks to process")
                sys.exit(2)

            if model is None:
                # Built once and reused for every batch of this run.
                print("Preparing model")
                model = build_model(model_name)

            with tempfile.TemporaryDirectory() as temp_dir_name:
                reported = process_preview_batch(tracks_to_process, model, model_name, sanity, temp_dir_name)
            print(f"[{datetime.datetime.now()}] Batch done: reported {reported} result(s) "
                  f"for {len(tracks_to_process)} track(s)", flush=True)

            if not args.loop:
                break
            if reported == 0:
                # Everything in the batch failed transiently and stays queued:
                # don't fetch the same items again straight away.
                print(f"Nothing reported in this batch, waiting {NO_PROGRESS_WAIT_S} s", flush=True)
                time.sleep(NO_PROGRESS_WAIT_S)

print("Processing completed successfully")
exit(0)

'''
            print("Storing result in database")
            with conn.cursor() as cur:
                cur.execute(f"""
          INSERT INTO track
            (track_path, track_key, track_bpm, track_isrc, track_genre, track_energy, track_release_date, track_artist, track_title, track_album, track_label)
          VALUES ('{escaped_file_path}', {tags["key"]}, {tags["bpm"]}, {tags["isrc"]}, {tags["genre"]}, {tags["energy"]}, {tags["date"]}, {tags["artist"]}, {tags["title"]}, {tags["album"]}, {tags["label"]})
          ON CONFLICT ON CONSTRAINT track_track_path_key
          DO UPDATE
            SET
              track_key = COALESCE(EXCLUDED.track_key, track.track_key),
              track_bpm = COALESCE(EXCLUDED.track_bpm, track.track_bpm),
              track_isrc = COALESCE(EXCLUDED.track_isrc, track.track_isrc),
              track_genre = COALESCE(EXCLUDED.track_genre, track.track_genre),
              track_energy = COALESCE(EXCLUDED.track_energy, track.track_energy),
              track_release_date = COALESCE(EXCLUDED.track_release_date, track.track_release_date),
              track_artist = COALESCE(EXCLUDED.track_artist, track.track_artist),
              track_title = COALESCE(EXCLUDED.track_title, track.track_title),
              track_album = COALESCE(EXCLUDED.track_album, track.track_album)""")

                cur.execute(f"""
        INSERT INTO track_spotify_audio_features (track_id, track_spotify_audio_features)
        SELECT track_id, '{json.dumps(spotify_details)}'
        FROM track
        WHERE track_path='{escaped_file_path}'
        ON CONFLICT ON CONSTRAINT track_spotify_audio_features_track_id_key
        DO UPDATE
          SET track_spotify_audio_features = EXCLUDED.track_spotify_audio_features""")

                cur.execute(f"""
          INSERT INTO track_embedding
          (track_id, track_embedding_vector, track_embedding_type)
          SELECT track_id, '{embeddings.T.mean(1).tolist()}', '{args.model}'
          FROM track
          WHERE track_path='{escaped_file_path}'
          ON CONFLICT ON CONSTRAINT track_embedding_track_id_track_embedding_type_key
          DO UPDATE
            SET track_embedding_vector = EXCLUDED.track_embedding_vector""")
'''
