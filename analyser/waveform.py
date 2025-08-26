from dotenv import load_dotenv

load_dotenv()

from matplotlib import pyplot
from scipy.io import wavfile
import numpy
from LoopbackServer import LoopbackServer
import os
import uuid
from minio import Minio
import urllib.request
import sys
from pydub import AudioSegment

from input import start_input_thread
import time
import webbrowser
import json
import requests
from oidc_common import OpenIDConfiguration, ClientConfiguration, get_client_state
import datetime

waveform_storage_url = os.getenv("WAVEFORM_STORAGE_HOST")
access_key = os.getenv("WAVEFORM_STORAGE_BUCKET_ACCESS_KEY")
secret_key = os.getenv("WAVEFORM_STORAGE_BUCKET_SECRET_KEY")

waveform_storage_client = Minio(waveform_storage_url,
                                access_key=access_key,
                                secret_key=secret_key,
                                )

waveform_storage_bucket = os.getenv("WAVEFORM_STORAGE_BUCKET_NAME")

found = waveform_storage_client.bucket_exists(waveform_storage_bucket)
if not found:
    sys.exit("Waveform storage bucket does not exist!")


def get_next_waveform_previews(id_token, batch_size=20):
    res = requests.get(
        f"https://fomoplayer.com/api/admin/preview?limit={batch_size}&stores=Bandcamp",
        headers={'Authorization': f"Bearer {id_token}"}
    )
    print(res.status_code)
    print(res.text)
    return res.json()


def generate_waveform(file_path):
    samplerate, data = wavfile.read(file_path)
    length = data.shape[0] / samplerate
    time = numpy.linspace(0., length, data.shape[0])

    fig = pyplot.figure(frameon=False)
    fig.set_size_inches(data.shape[0] / 6000, 250)
    ax = pyplot.axes([0, 0, 1, 1], frameon=False)

    # Then we disable our xaxis and yaxis completely. If we just say plt.axis('off'),
    # they are still used in the computation of the image padding.
    ax.get_xaxis().set_visible(False)
    ax.get_yaxis().set_visible(False)

    # Even though our axes (plot region) are set to cover the whole image with [0,0,1,1],
    # by default they leave padding between the plotted data and the frame. We use tigher=True
    # to make sure the data gets scaled to the full extents of the axes.
    pyplot.autoscale(tight=True)

    ax.plot(time, data[:, 0], color='white', linewidth=1, antialiased=False)

    pyplot.savefig('waveform.png', dpi=1)


def upload_waveform(file_path):
    destination_file = f"{uuid.uuid4()}.png"
    waveform_storage_client.fput_object(
        waveform_storage_bucket, destination_file, file_path
    )
    return f"https://{waveform_storage_url}/{waveform_storage_bucket}/{destination_file}"


MAX_AGE = 90 * 60
TOKEN_PATH = './.fomo_player_token'

client = ClientConfiguration(client_configuration='oidc_configuration.json',
                             client_secret=os.getenv("GOOGLE_NATIVE_APP_OIDC_CLIENT_SECRET"),
                             client_id=os.getenv("GOOGLE_NATIVE_APP_OIDC_CLIENT_ID"))
provider = OpenIDConfiguration('https://accounts.google.com/.well-known/openid-configuration')

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
        outfile.write(json.dumps({"id_token": id_token, "expires_in": time.time() + token_response["expires_in"]}))

    return id_token


if __name__ == '__main__':
    print(f"[{datetime.datetime.now()}] Starting")
    id_token = get_oauth2_token()
    print("Getting next tracks to analyse")
    store_tracks_to_process = get_next_waveform_previews(id_token)
    print(f"Got {len(store_tracks_to_process)} previews")
    waveform_details = []
    missing_previews = []

    for store_track in store_tracks_to_process:
        storeTrackId = store_track.get("id")
        storeTrackUrl = store_track.get("url")
        previewUrl = store_track.get("preview_url")
        previewStartMs = store_track.get("start_ms")
        previewEndMs = store_track.get("end_ms")
        previewId = store_track.get("preview_id")
        storeName = store_track.get("store_name")

        print(f"Processing store track {storeTrackId} / {storeTrackUrl}")
        try:
            local_filename, _ = urllib.request.urlretrieve(previewUrl)
            absolute_file_path = local_filename.replace("'", "\''")
            print(f"Processing: {absolute_file_path}")

            print("Converting mp3 to wav")
            sound = AudioSegment.from_mp3(absolute_file_path)
            sound.export('./output.wav', format="wav")
            print("Generating waveform")
            generate_waveform('./output.wav')
            print("Uploading waveform")
            waveform_url = upload_waveform('./waveform.png')
            print("Appending waveform details")
            data = {"id": previewId, "waveform_url": waveform_url, "start_ms": previewStartMs, "end_ms": previewEndMs}
            waveform_details.append(data)
        except Exception as e:
            print("Downloading preview failed")
            missing_previews.append({"preview_id": previewId, "missing": True})

    print("Sending waveform details")
    print(json.dumps(waveform_details))
    res = requests.post(f"{os.getenv('API_URL')}/admin/waveform",
                        headers={'Authorization': f"Bearer {id_token}"},
                        json=waveform_details)
    if (res.status_code != 200):
        print("Sending waveform details failed")

    print(f"Reporting missing track previews")
    res = requests.post(f"{os.getenv('API_URL')}/admin/analyse",
                        headers={'Authorization': f"Bearer {id_token}"},
                        json=missing_previews)
    if (res.status_code != 200):
        print("Sending waveform details failed")


    print(res.text)
