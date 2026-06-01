from dotenv import load_dotenv

load_dotenv()

from essentia.standard import MonoLoader, TensorflowPredictEffnetDiscogs

import json
import requests
from auth import auth_header, get_api_url, request_error

from pydub import AudioSegment
from spotipy.oauth2 import SpotifyClientCredentials
import argparse
import hashlib
import os
import spotipy
import sys
import taglib
import tempfile
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
ap.add_argument("--sanity-window", type=int, default=20,
                help="How many previously generated embeddings to keep on disk and compare against to detect bit-identical duplicates. 0 disables the check.")
ap.add_argument("--skip-sanity-confirmation", action="store_true",
                help="Skip the y/N prompt when an embedding collision is detected; log the warning and continue. Required for unattended runs (e.g. analyse_all.sh).")
args = ap.parse_args()


SANITY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".embedding_sanity.json")
COLLISIONS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "embedding_collisions.jsonl")


class EmbeddingSanityChecker:
    """Detects bit-identical embeddings across a rolling window of recent items.

    Two different inputs producing the exact same vector almost always means the
    model is broken (all-zero output, constant output, etc.). The checker
    fingerprints each vector (SHA256 of the rounded list), persists a window of
    the last N entries to disk, and warns / prompts when a new vector matches a
    different earlier id. After the operator confirms once for a run, no further
    prompts fire that run.
    """

    def __init__(self, window_size, skip_prompt):
        self.window_size = max(0, window_size)
        self.skip_prompt = skip_prompt
        self.entries = []
        self.confirmed_continue = False
        if self.window_size > 0 and os.path.isfile(SANITY_FILE):
            try:
                with open(SANITY_FILE) as f:
                    self.entries = json.load(f).get("entries", [])
            except (json.JSONDecodeError, OSError) as e:
                print(f"[sanity] Could not load {SANITY_FILE}: {e}. Starting fresh.")

    @staticmethod
    def _signature(vector):
        # Round to absorb tiny non-determinism (e.g. nondeterministic GPU ops);
        # bit-identical real embeddings to 6 decimals across 1280 dims means the
        # model is degenerate, not that two tracks happen to sound alike.
        rounded = [round(float(x), 6) for x in vector]
        return hashlib.sha256(json.dumps(rounded).encode("utf-8")).hexdigest()

    def _persist(self):
        try:
            with open(SANITY_FILE, "w") as f:
                json.dump({"entries": self.entries[-self.window_size:]}, f)
        except OSError as e:
            print(f"[sanity] WARNING: failed to persist {SANITY_FILE}: {e}")

    @staticmethod
    def _describe(item_id, label):
        """Format an entry as 'id=<x>' or 'id=<x> [<label>]' for log lines."""
        if label:
            return f"id={item_id} [{label}]"
        return f"id={item_id}"

    @staticmethod
    def _append_collision(signature, new_entry, old_entry):
        """Append one collision pair to COLLISIONS_FILE (JSONL, append-only).

        Operators investigate later with e.g.
            jq -s 'group_by(.hash) | map({hash:.[0].hash, ids:[.[].new.id]+[.[].old.id]|unique})' embedding_collisions.jsonl
        to reconstruct full clusters of items that produced the same vector.
        """
        record = {
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "hash": signature,
            "new": {
                "id": new_entry["id"],
                "label": new_entry.get("label"),
                "group_key": new_entry.get("group_key"),
            },
            "old": {
                "id": old_entry["id"],
                "label": old_entry.get("label"),
                "group_key": old_entry.get("group_key"),
            },
        }
        try:
            with open(COLLISIONS_FILE, "a") as f:
                f.write(json.dumps(record) + "\n")
        except OSError as e:
            print(f"[sanity] WARNING: failed to append to {COLLISIONS_FILE}: {e}")

    def record_and_check(self, item_id, vector, label=None, group_key=None):
        """Return True to continue, False if the operator chose to abort.

        - `label` is shown next to the id in warnings (e.g. `track_id=123`).
        - `group_key` (if given) identifies a logical source larger than the
          single item: e.g. for store previews the track_id, so two previews
          of the same track aren't flagged as a model failure. Two entries
          with the same `group_key` are NOT treated as collisions.
        - Every collision pair is appended to COLLISIONS_FILE for later
          investigation, even when --skip-sanity-confirmation suppresses the
          interactive prompt.
        """
        if self.window_size <= 0:
            return True

        signature = self._signature(vector)
        item_id_str = str(item_id)
        group_key_str = str(group_key) if group_key is not None else None

        new_entry = {"id": item_id_str, "hash": signature}
        if label:
            new_entry["label"] = label
        if group_key_str:
            new_entry["group_key"] = group_key_str

        def is_same_source(entry):
            # Same preview/sample id → re-analysis, not a model bug.
            if entry.get("id") == item_id_str:
                return True
            # Same group (e.g. two previews of one track) → expected, not a bug.
            if group_key_str and entry.get("group_key") == group_key_str:
                return True
            return False

        collisions = [e for e in self.entries
                      if e.get("hash") == signature and not is_same_source(e)]

        if collisions:
            for old in collisions:
                self._append_collision(signature, new_entry, old)

            first = collisions[0]
            new_desc = self._describe(item_id_str, label)
            old_desc = self._describe(first["id"], first.get("label"))
            others = len(collisions) - 1
            suffix = (
                f" (and {others} other earlier match{'es' if others != 1 else ''})"
                if others else ""
            )
            print(
                f"\n[sanity] WARNING: embedding for {new_desc} is bit-identical to "
                f"a previously generated embedding for {old_desc}{suffix}.",
                flush=True,
            )
            print(
                f"[sanity] Full collision record(s) appended to {COLLISIONS_FILE}",
                flush=True,
            )
            print(
                "[sanity] This usually indicates a broken / degenerate model "
                "(constant or all-zero output), not two genuinely identical tracks.",
                flush=True,
            )
            if self.confirmed_continue:
                print("[sanity] (continue already confirmed earlier this run — proceeding)", flush=True)
            elif self.skip_prompt:
                print("[sanity] --skip-sanity-confirmation set — proceeding without prompt.", flush=True)
            else:
                try:
                    answer = input("[sanity] Continue anyway? [y/N]: ").strip().lower()
                except EOFError:
                    answer = ""
                if answer not in ("y", "yes"):
                    print("[sanity] Operator declined — aborting batch.", flush=True)
                    return False
                self.confirmed_continue = True

        self.entries.append(new_entry)
        self._persist()
        return True


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


def get_next_analysis_tracks(model='discogs_multi_embeddings-effnet-bs64-1', purchased=True, batch_size=10):
    print("Getting next tracks to analyse")
    print(purchased)
    print(f"{get_api_url()}/admin/analyse?model={model}&batch_size={batch_size}&purchased={'true' if purchased else ''}")
    res = requests.get(
        f"{get_api_url()}/admin/analyse?model={model}&batch_size={batch_size}&purchased={'true' if purchased else ''}",
        headers=auth_header()
    )
    if (res.status_code != 200):
        raise Exception(request_error("Next tracks request", res))
    return _parse_json_or_explain("Next tracks request", res)


def get_next_audio_samples(batch_size=10):
    print("Getting next audio samples to analyse")
    print(f"{get_api_url()}/admin/notification-audio-samples/without-embedding?limit={batch_size}")
    res = requests.get(
        f"{get_api_url()}/admin/notification-audio-samples/without-embedding?limit={batch_size}",
        headers=auth_header()
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

def build_model(model_name):
    graph_filename = f"./models/{model_name}.pb"
    return TensorflowPredictEffnetDiscogs(graphFilename=graph_filename, output="PartitionedCall:1")


def compute_temporal_embedding(wav_path, model):
    """Load audio at 16kHz and run the model, returning the (n_patches, 1280)
    per-patch temporal embedding matrix."""
    audio = MonoLoader(filename=wav_path, sampleRate=16000, resampleQuality=4)()
    return model(audio)


if __name__ == '__main__':
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
                    urllib.request.urlretrieve(sampleUrl, temp_filename)
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

            output_wav_path = os.path.join(temp_dir_name, "output.wav")
            for sample in samples:
                if (sample['missing']):
                    print(f"Skipping missing audio sample with id: {sample['id']}")
                    continue
                else:
                    absolute_file_path = sample.get("path").replace("'", "\''")
                    try:
                        print(f"Processing: {absolute_file_path}")

                        # Determine file format and convert to wav if needed
                        file_ext = os.path.splitext(absolute_file_path)[1].lower()
                        if file_ext in ['.mp3', '.mpeg']:
                            print("Converting mp3 to wav")
                            sound = AudioSegment.from_mp3(absolute_file_path)
                            sound.export(output_wav_path, format="wav")
                        elif file_ext == '.wav':
                            print("File is already wav format")
                            import shutil
                            shutil.copy(absolute_file_path, output_wav_path)
                        else:
                            print(f"Unsupported file format: {file_ext}")
                            continue

                        print("Preparing audio")
                        audio = MonoLoader(filename=output_wav_path, sampleRate=16000, resampleQuality=4)()
                        print("Preparing model")
                        model_name = args.model or 'discogs_multi_embeddings-effnet-bs64-1'
                        graphFilename = f"./models/{model_name}.pb"
                        model = TensorflowPredictEffnetDiscogs(
                            graphFilename=graphFilename,
                            output="PartitionedCall:1")
                        print("Processing audio")
                        embeddings = model(audio)
                        vector = embeddings.T.mean(1).tolist()

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
                                            json=data)
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
                        if os.path.exists(output_wav_path):
                            os.remove(output_wav_path)
                    except Exception as e:
                        print("Failed removing temp file")
                        print(e)
    else:
        # Process store track previews (original behavior)
        purchased = args.purchased is not None
        tracks_to_process = get_next_analysis_tracks(purchased=purchased, batch_size=args.batch_size)
        print(f"Got {len(tracks_to_process)} tracks")

        if (len(tracks_to_process) == 0):
            print("No tracks to process")
            sys.exit(2)

        tracks = []

        with tempfile.TemporaryDirectory() as temp_dir_name:
            for track in tracks_to_process:
                previews = track.get('previews')
                found = False
                for preview in previews:
                    previewUrl = preview.get("url")
                    previewId = preview.get("preview_id")
                    print(f"Downloading preview with id {previewId} from : {previewUrl}")
                    try:
                        local_filename, _ = urllib.request.urlretrieve(previewUrl)
                        print(f"Downloaded to: {local_filename}")
                        tracks.append({"id": track.get('track_id'), "isrc": track.get('track_isrc'),
                                       "preview_id": preview.get("preview_id"), "url": previewUrl,
                                       "path": local_filename, "missing": False})
                        found = True
                        break
                    except Exception as e:
                        print("Downloading preview failed")
                        tracks.append({"id": track.get('track_id'), "isrc": track.get('track_isrc'),
                                       "preview_id": preview.get("preview_id"),
                                       "missing": True})
                        print(e)
                if not found:
                    print(f"Failed to find a working preview for track {track.get('track_id')}")

            # Build the model once and reuse it across the batch.
            model_name = args.model or 'discogs_multi_embeddings-effnet-bs64-1'
            print("Preparing model")
            model = build_model(model_name)

            output_wav_path = os.path.join(temp_dir_name, "output.wav")

            for track in tracks:
                if (track['missing']):
                    print(f"Reporting track preview missing with id: {track['preview_id']}")
                    data = [{"preview_id": track.get("preview_id"), "missing": True}]
                    res = requests.post(f"{get_api_url()}/admin/analyse",
                                        headers=auth_header(),
                                        json=data)
                else:
                    absolute_file_path = track.get("path").replace("'", "\''")
                    try:
                        print(f"Processing: {absolute_file_path}")

                        print("Converting mp3 to wav")
                        sound = AudioSegment.from_mp3(absolute_file_path)
                        sound.export(output_wav_path, format="wav")

                        print("Extracting metadata from ID3 tags")

                        spotify_details = {}
                        isrc = track["isrc"]
                        if isrc != 'null':
                            print(f"Fetching Spotify audio features for ISRC: {isrc}")
                            # spotify_details = get_spotify_details(isrc)
                        print("Preparing audio")
                        print("Processing audio")
                        embeddings = compute_temporal_embedding(output_wav_path, model)
                        vector = embeddings.T.mean(1).tolist()

                        preview_id = track.get("preview_id")
                        track_id = track.get("id")
                        label = f"track_id={track_id}" if track_id is not None else None
                        if not sanity.record_and_check(preview_id, vector, label=label, group_key=track_id):
                            sys.exit(1)

                        print(f"Processing done, sending details for preview with id: {preview_id}")
                        data = [{"id": preview_id,
                                 "embeddings": json.dumps(vector),
                                 "model": model_name,
                                 "spotify": spotify_details}]
                        res = requests.post(f"{get_api_url()}/admin/analyse",
                                            headers=auth_header(),
                                            json=data)
                        if res.status_code != 200:
                            print(f"Error reporting results for {track['id']}")
                            print(f"Status code: {res.status_code}")
                            print(res.text)
                    except Exception as e:
                        print(f"Error processing {absolute_file_path}")
                        print(e)
                        print(traceback.format_exc())

                    print("Removing temp file")
                    try:
                        os.remove(absolute_file_path)
                    except Exception as e:
                        print("Failed removing temp file")
                        print(e)

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
