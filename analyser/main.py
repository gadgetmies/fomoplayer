from dotenv import load_dotenv

load_dotenv()

from LoopbackServer import LoopbackServer
from essentia.standard import MonoLoader, TensorflowPredictEffnetDiscogs

from input import start_input_thread
import time
import webbrowser
import json
import requests
from oidc_common import OpenIDConfiguration, ClientConfiguration, get_client_state

from pydub import AudioSegment
from spotipy.oauth2 import SpotifyClientCredentials
import argparse
import os
import spotipy
import taglib
import tempfile
import traceback
import urllib.request
import sys
import datetime

spotify = spotipy.Spotify(auth_manager=SpotifyClientCredentials())

# Construct the argument parser
ap = argparse.ArgumentParser()

# Add the arguments to the parser
ap.add_argument("-m", "--model", help="Model type (e.g. 'discogs_multi_embeddings-effnet-bs64-1')")
ap.add_argument("-p", "--purchased", help="Analyse purchased tracks")
args = ap.parse_args()

client = ClientConfiguration(client_configuration='oidc_configuration.json',
                             client_secret=os.getenv("GOOGLE_NATIVE_APP_OIDC_CLIENT_SECRET"),
                             client_id=os.getenv("GOOGLE_NATIVE_APP_OIDC_CLIENT_ID"))

provider = OpenIDConfiguration('https://accounts.google.com/.well-known/openid-configuration')


# tracks = glob(args.path + '/**/*.mp3', recursive=True)

def get_next_analysis_tracks(id_token, model='discogs_multi_embeddings-effnet-bs64-1', purchased=True, batch_size=10):
    print("Getting next tracks to analyse")
    print(purchased)
    print(f"{os.getenv('API_URL')}/admin/analyse?model={model}&batch_size={batch_size}&purchased={'true' if purchased else ''}")
    res = requests.get(
        f"{os.getenv('API_URL')}/admin/analyse?model={model}&batch_size={batch_size}&purchased={'true' if purchased else ''}",
        headers={'Authorization': f"Bearer {id_token}"}
    )
    if (res.status_code != 200):
        raise Exception(f"Next tracks request returned an error {res.text}")
    return res.json()


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

MAX_AGE = 90 * 60
TOKEN_PATH = './.fomo_player_token'


def get_oauth2_token():
    if os.path.isfile(TOKEN_PATH):
        with open(TOKEN_PATH, 'r') as file:
            # You might consider a test API call to establish token validity here.
            token = json.load(file)
            if  token["expires_in"] > time.time():
                return token["id_token"]
            else:
                body = {
                    "client_id": client.client_id,
                    "client_secret": client.client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": token["refresh_token"],
                }

                r = requests.post(provider.token_endpoint, data=body)

                # handles error from token response

                token_response = r.json()
                id_token = token_response["id_token"]
                with open(TOKEN_PATH, 'w') as outfile:
                    outfile.write(
                        json.dumps({"id_token": id_token, "expires_in": time.time() + token_response["expires_in"],
                                    "refresh_token": token["refresh_token"]}))

                return id_token

    with LoopbackServer(provider, client) as httpd:
        # launch web browser
        webbrowser.open(httpd.base_uri)
        # wait for input
        start_input_thread("Press enter to stop\r\n", httpd.done)
        # process http requests until authorization response is received
        if httpd.wait_authorization_response() is None:
            sys.exit()

    if "error" in httpd.authorization_response:
        raise Exception(httpd.authorization_response["error"][0])

    state = get_client_state(httpd.authorization_response)

    body = {
        "grant_type": "authorization_code",
        "redirect_uri": httpd.redirect_uri,
        "code": httpd.authorization_response["code"][0],
        "code_verifier": state.code_verifier,
    }

    auth = (client.client_id, client.client_secret)

    r = requests.post(provider.token_endpoint, data=body, auth=auth)

    # handles error from token response

    token_response = r.json()

    if "error" in token_response:
        raise Exception(token_response["error"])

    id_token = token_response["id_token"]
    with open(TOKEN_PATH, 'w') as outfile:
        os.chmod(TOKEN_PATH, 0o600)
        outfile.write(json.dumps({"id_token": id_token, "expires_in": time.time() + token_response["expires_in"],
                                  "refresh_token": token_response["refresh_token"]}))

    return id_token


if __name__ == '__main__':
    print(f"[{datetime.datetime.now()}] Starting")
    id_token = get_oauth2_token()
    tracks_to_process = get_next_analysis_tracks(id_token, purchased=args.purchased)
    print(f"Got {len(tracks_to_process)} tracks")
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

    for track in tracks:
        if (track['missing']):
            print(f"Reporting track preview missing with id: {track['preview_id']}")
            data = [{"preview_id": track.get("preview_id"), "missing": True}]
            res = requests.post(f"{os.getenv('API_URL')}/admin/analyse",
                                headers={'Authorization': f"Bearer {id_token}"},
                                json=data)
        else:
            absolute_file_path = track.get("path").replace("'", "\''")
            try:
                print(f"Processing: {absolute_file_path}")

                print("Converting mp3 to wav")
                sound = AudioSegment.from_mp3(absolute_file_path)
                sound.export('./output.wav', format="wav")

                print("Extracting metadata from ID3 tags")

                spotify_details = {}
                isrc = track["isrc"]
                if isrc != 'null':
                    print(f"Fetching Spotify audio features for ISRC: {isrc}")
                    # spotify_details = get_spotify_details(isrc)
                # outputFile = NamedTemporaryFile()
                print("Preparing audio")
                audio = MonoLoader(filename='./output.wav', sampleRate=16000, resampleQuality=4)()
                print("Preparing model")
                graphFilename = f"./models/{args.model}.pb"
                model = TensorflowPredictEffnetDiscogs(
                    graphFilename=graphFilename,
                    output="PartitionedCall:1")
                print("Processing audio")
                embeddings = model(audio)

                print(f"Processing done, sending details for preview with id: {track.get("preview_id")}")
                data = [{"id": track.get("preview_id"),
                         "embeddings": json.dumps(embeddings.T.mean(1).tolist()),
                         "model": args.model,
                         "spotify": spotify_details}]
                res = requests.post(f"{os.getenv('API_URL')}/admin/analyse",
                                    headers={'Authorization': f"Bearer {id_token}"},
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
