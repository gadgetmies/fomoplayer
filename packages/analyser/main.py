from dotenv import load_dotenv

load_dotenv()

from essentia.standard import MonoLoader, TensorflowPredictEffnetDiscogs
import argparse
from pydub import AudioSegment
import taglib
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import json
import urllib.request
import requests
import tempfile
import os

spotify = spotipy.Spotify(auth_manager=SpotifyClientCredentials())

# Construct the argument parser
ap = argparse.ArgumentParser()

# Add the arguments to the parser
ap.add_argument("-m", "--model", choices=['artist', 'multi'], help="Model type", default='artist')
args = ap.parse_args()


# tracks = glob(args.path + '/**/*.mp3', recursive=True)

def get_next_tracks(model='effnet-multi', batch_size=20):
    with urllib.request.urlopen(
            f"https://fomoplayer.com/api/admin/analyse?model={model}&batch_size={batch_size}") as url:
        return json.load(url)


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


def get_spotify_details(isrc):
    result = spotify.search(q=f'isrc:{isrc}')
    items = result['tracks']['items']
    if len(items) > 0:
        id = items[0]['id']
        features = spotify.audio_features([id])
        return features[0]
    else:
        return {}


if __name__ == '__main__':
    tracksToProcess = get_next_tracks()
    tracks = []

    with tempfile.TemporaryDirectory() as temp_dir_name:
        for track in tracksToProcess:
            print(f"Downloading: {track.url}")
            local_filename = urllib.request.urlretrieve(track.url, temp_dir_name)
            tracks.append({"id": track['id'], "isrc": track['isrc'], "path": local_filename})

    for track in tracks:
        absoluteFilePath = track["path"]
        escaped_file_path = absoluteFilePath.replace("'", "\''")
        print(f"Processing: {absoluteFilePath}")
        try:
            print("Extracting metadata from ID3 tags")

            spotify_details = {}
            isrc = track["isrc"]
            if isrc != 'null':
                print(f"Fetching Spotify audio features for ISRC: {isrc}")
                spotify_details = get_spotify_details(isrc)
            # outputFile = NamedTemporaryFile()
            print("Converting mp3 to wav")
            sound = AudioSegment.from_mp3(absoluteFilePath)
            sound.export('./output.wav', format="wav")
            print("Preparing audio")
            audio = MonoLoader(filename='./output.wav', sampleRate=16000, resampleQuality=4)()
            print("Preparing model")
            model = TensorflowPredictEffnetDiscogs(graphFilename=f"discogs_{args.model}_embeddings-effnet-bs64-1.pb",
                                                   output="PartitionedCall:1")
            print("Processing audio")
            embeddings = model(audio)

            res = requests.post(f"{os.getenv('API_URL')}/admin/analysis",
                                json={"id": track["id"],
                                      "embeddings": embeddings.T.mean(1).tolist(),
                                      model: args.model,
                                      "spotify": spotify_details})
            if res.status_code != 200:
                print(f"Error reporting results for {track['id']}")
                print(res.text)
        except Exception as e:
            print(f"Error processing {absoluteFilePath}")
            print(e)
            continue

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
