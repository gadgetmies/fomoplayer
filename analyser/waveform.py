from dotenv import load_dotenv

load_dotenv()

from matplotlib import pyplot
from scipy.io import wavfile
import numpy
import os
import tempfile
import uuid
from minio import Minio
import urllib.request
import sys
from pydub import AudioSegment

import json
import requests
from auth import auth_header, get_api_url
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


def get_next_waveform_previews(batch_size=20):
    res = requests.get(
        f"{get_api_url()}/admin/preview?limit={batch_size}&stores=Bandcamp",
        headers=auth_header()
    )
    print(res.status_code)
    print(res.text)
    return res.json()


def generate_waveform(file_path, output_path):
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

    pyplot.savefig(output_path, dpi=1)


def upload_waveform(file_path):
    destination_file = f"{uuid.uuid4()}.png"
    waveform_storage_client.fput_object(
        waveform_storage_bucket, destination_file, file_path
    )
    return f"https://{waveform_storage_url}/{waveform_storage_bucket}/{destination_file}"


if __name__ == '__main__':
    print(f"[{datetime.datetime.now()}] Starting")
    print("Getting next tracks to analyse")
    store_tracks_to_process = get_next_waveform_previews()
    print(f"Got {len(store_tracks_to_process)} previews")

    if len(store_tracks_to_process) == 0:
        print("No previews to process")
        sys.exit(2)

    waveform_details = []
    missing_previews = []

    with tempfile.TemporaryDirectory() as temp_dir_name:
        output_wav_path = os.path.join(temp_dir_name, "output.wav")
        waveform_png_path = os.path.join(temp_dir_name, "waveform.png")

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
                sound.export(output_wav_path, format="wav")
                print("Generating waveform")
                generate_waveform(output_wav_path, waveform_png_path)
                print("Uploading waveform")
                waveform_url = upload_waveform(waveform_png_path)
                print("Appending waveform details")
                data = {"id": previewId, "waveform_url": waveform_url, "start_ms": previewStartMs, "end_ms": previewEndMs}
                waveform_details.append(data)
            except Exception as e:
                print("Downloading preview failed")
                missing_previews.append({"preview_id": previewId, "missing": True})

        print("Sending waveform details")
        print(json.dumps(waveform_details))
        res = requests.post(f"{get_api_url()}/admin/waveform",
                            headers=auth_header(),
                            json=waveform_details)
        if (res.status_code != 200):
            print("Sending waveform details failed")

        print(f"Reporting missing track previews")
        res = requests.post(f"{get_api_url()}/admin/analyse",
                            headers=auth_header(),
                            json=missing_previews)
        if (res.status_code != 200):
            print("Sending waveform details failed")


        print(res.text)
