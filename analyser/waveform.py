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

import argparse
import json
import time
import requests
from auth import auth_header, get_api_url
import bandcamp
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


# A preview whose download or decoding keeps failing for other reasons than a
# rate limit is reported missing after this many attempts, so it can't hold up
# the front of the queue forever.
MAX_ATTEMPTS = 3
# Rate-limit pauses double while Bandcamp keeps refusing, up to this length.
MAX_RATE_LIMIT_PAUSE_S = 3600
# 429 is always a rate limit and is waited out; 403 may be a rate limit or a
# page that is gone, so it is waited out only this many times per preview.
MAX_FORBIDDEN_PAUSES = 2


def get_next_waveform_previews(batch_size):
    res = requests.get(
        f"{get_api_url()}/admin/preview?limit={batch_size}&stores=Bandcamp",
        headers=auth_header()
    )
    res.raise_for_status()
    return res.json()


def post_to_api(path, payload):
    """POST to our own API, retrying through transient network outages.

    A dropped connection (e.g. the laptop sleeping) must not crash the worker
    and throw away a whole batch's rendered waveforms, so keep retrying until
    the request goes through rather than letting the RequestException escape.
    """
    while True:
        try:
            res = requests.post(f"{get_api_url()}{path}", headers=auth_header(), json=payload)
            if res.status_code != 200:
                print(f"POST {path} failed: {res.status_code} {res.text[:500]}", flush=True)
            return
        except requests.RequestException as e:
            print(f"POST {path} failed: {e!r}; retrying in 60 s", flush=True)
            time.sleep(60)


# One pixel column per this many samples, as in the waveforms generated so far.
SAMPLES_PER_PIXEL = 6000
# Samples per min/max block of the drawn envelope (several blocks per pixel).
ENVELOPE_BLOCK = 1000


def envelope(data, block):
    """Min and max of each block of samples, the last block possibly shorter."""
    full = len(data) // block * block
    mins = data[:full].reshape(-1, block).min(axis=1)
    maxs = data[:full].reshape(-1, block).max(axis=1)
    if full < len(data):
        mins = numpy.append(mins, data[full:].min())
        maxs = numpy.append(maxs, data[full:].max())
    return mins, maxs


def generate_waveform(file_path, output_path):
    samplerate, data = wavfile.read(file_path)
    if data.ndim > 1:
        data = data[:, 0]
    length = data.shape[0] / samplerate

    # The figure is drawn at its own dpi before savefig: at the default 100 dpi
    # that is a canvas 100x the size of the 1-dpi image.
    fig = pyplot.figure(frameon=False, dpi=1)
    fig.set_size_inches(data.shape[0] / SAMPLES_PER_PIXEL, 250)
    ax = pyplot.axes([0, 0, 1, 1], frameon=False)

    # Then we disable our xaxis and yaxis completely. If we just say plt.axis('off'),
    # they are still used in the computation of the image padding.
    ax.get_xaxis().set_visible(False)
    ax.get_yaxis().set_visible(False)

    # Plotting every sample of a full Bandcamp track (millions of points)
    # overflows the Agg renderer; at a few hundred pixels per minute the
    # per-block min/max envelope draws the same image.
    mins, maxs = envelope(data, ENVELOPE_BLOCK)
    time = numpy.arange(len(mins)) * ENVELOPE_BLOCK / samplerate
    ax.fill_between(time, mins, maxs, color='white', linewidth=1, antialiased=False)
    ax.set_xlim(0, length)
    ax.set_ylim(data.min(), data.max())

    pyplot.savefig(output_path, dpi=1)
    pyplot.close(fig)


def upload_waveform(file_path):
    destination_file = f"{uuid.uuid4()}.png"
    waveform_storage_client.fput_object(
        waveform_storage_bucket, destination_file, file_path
    )
    return f"https://{waveform_storage_url}/{waveform_storage_bucket}/{destination_file}"


class Backoff:
    """Pauses while Bandcamp rate-limits us: 10 min, doubling up to an hour,
    back to 10 min after a successful request."""

    def __init__(self):
        self.pause_s = bandcamp.RATE_LIMIT_PAUSE_S

    def wait(self, reason):
        print(f"[{datetime.datetime.now()}] {reason}; pausing for {self.pause_s} s", flush=True)
        time.sleep(self.pause_s)
        self.pause_s = min(self.pause_s * 2, MAX_RATE_LIMIT_PAUSE_S)

    def reset(self):
        self.pause_s = bandcamp.RATE_LIMIT_PAUSE_S


def download(url, path):
    """Download url to path. Raises bandcamp.RateLimited on 429, and
    StreamExpired on 403/410, which an expired Bandcamp stream URL returns."""
    with requests.get(url, stream=True, timeout=60) as res:
        if res.status_code == 429:
            raise bandcamp.RateLimited(f"Bandcamp returned 429 for the stream of {url}", 429)
        if res.status_code in (403, 410):
            raise StreamExpired(f"Stream returned {res.status_code}")
        res.raise_for_status()
        with open(path, "wb") as f:
            for chunk in res.iter_content(chunk_size=1 << 16):
                f.write(chunk)


class StreamExpired(Exception):
    pass


def fetch_preview(preview, mp3_path, backoff):
    """Download the preview's audio to mp3_path. Returns True when downloaded,
    None when Bandcamp doesn't stream the track (report it missing). Waits out
    rate limits and retries; other errors are raised.

    A 403 can also mean the page or stream is gone for good, so a preview still
    refused with 403 after MAX_FORBIDDEN_PAUSES pauses is raised as a failure."""
    expired_retries = 0
    forbidden_pauses = 0
    while True:
        url = preview.get("preview_url")
        try:
            if not url and preview.get("store_name") == "Bandcamp":
                url = bandcamp.resolve_stream_url(preview.get("release_url"), preview.get("store_track_id"))
                if url is None:
                    return None
            download(url, mp3_path)
            backoff.reset()
            return True
        except bandcamp.RateLimited as e:
            if e.status_code == 403:
                forbidden_pauses += 1
                if forbidden_pauses > MAX_FORBIDDEN_PAUSES:
                    raise
            backoff.wait(str(e))
        except StreamExpired as e:
            # A cached release page carries stream URLs that expire: refetch it
            # once, and treat a second refusal as a rate limit.
            bandcamp._release_cache.pop(preview.get("release_url"), None)
            if expired_retries == 0:
                expired_retries += 1
                continue
            forbidden_pauses += 1
            if forbidden_pauses > MAX_FORBIDDEN_PAUSES:
                raise
            backoff.wait(f"{e} for preview {preview.get('preview_id')}")
            expired_retries = 0


def process_batch(previews, backoff, attempts):
    waveform_details = []
    missing_previews = []

    with tempfile.TemporaryDirectory() as temp_dir_name:
        mp3_path = os.path.join(temp_dir_name, "preview.mp3")
        output_wav_path = os.path.join(temp_dir_name, "output.wav")
        waveform_png_path = os.path.join(temp_dir_name, "waveform.png")

        for preview in previews:
            preview_id = preview.get("preview_id")
            print(f"Processing preview {preview_id} of store track {preview.get('id')} / {preview.get('url')}", flush=True)
            try:
                if fetch_preview(preview, mp3_path, backoff) is None:
                    print(f"Bandcamp has no stream for preview {preview_id}")
                    missing_previews.append({"preview_id": preview_id, "missing": True})
                    continue
                sound = AudioSegment.from_mp3(mp3_path)
                sound.export(output_wav_path, format="wav")
                generate_waveform(output_wav_path, waveform_png_path)
                waveform_url = upload_waveform(waveform_png_path)
                waveform_details.append({"id": preview_id, "waveform_url": waveform_url,
                                         "waveform_start_ms": preview.get("preview_start_ms"),
                                         "waveform_end_ms": preview.get("preview_end_ms")})
            except Exception as e:
                attempts[preview_id] = attempts.get(preview_id, 0) + 1
                print(f"Preview {preview_id} failed (attempt {attempts[preview_id]}/{MAX_ATTEMPTS}): {e!r}")
                if attempts[preview_id] >= MAX_ATTEMPTS:
                    missing_previews.append({"preview_id": preview_id, "missing": True})

    if waveform_details:
        post_to_api("/admin/waveform", waveform_details)
    if missing_previews:
        post_to_api("/admin/analyse", missing_previews)
    return len(waveform_details), len(missing_previews)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument("-b", "--batch-size", type=int, default=20, help="Previews fetched per batch")
    ap.add_argument("--loop", action="store_true",
                    help="Keep processing batches until no preview is left without a waveform")
    args = ap.parse_args()

    backoff = Backoff()
    attempts = {}
    total_done = total_missing = 0
    while True:
        print(f"[{datetime.datetime.now()}] Getting next previews without a waveform", flush=True)
        try:
            previews = get_next_waveform_previews(args.batch_size)
        except requests.RequestException as e:
            print(f"Fetching the queue failed: {e!r}; retrying in 60 s", flush=True)
            time.sleep(60)
            continue
        if len(previews) == 0:
            print("No previews to process")
            # A finished --loop run is a success; a single run keeps exit 2,
            # which the analyse_all.sh loop treats as "queue drained".
            sys.exit(0 if args.loop else 2)
        # Cached release pages hold stream URLs that expire; keep them for one batch only.
        bandcamp._release_cache.clear()
        done, missing = process_batch(previews, backoff, attempts)
        total_done += done
        total_missing += missing
        print(f"[{datetime.datetime.now()}] Batch: {done} waveforms, {missing} missing. "
              f"Total: {total_done} waveforms, {total_missing} missing", flush=True)
        if not args.loop:
            break
