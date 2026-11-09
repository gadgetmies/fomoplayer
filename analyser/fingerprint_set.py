#!/usr/bin/env python3
"""Extract Panako fingerprints for a DJ set recording.

Runs the production preview extractor (`extraction.extract_panako_fingerprints`)
on a whole set so the result can be matched against the preview fingerprints
in the database (see packages/back/scripts/dj-set/tracklist.js). Nothing is
uploaded.

The input is a local audio file or a URL. URLs (SoundCloud, Mixcloud,
YouTube, ...) are downloaded with `yt-dlp`, which must be on PATH; when it is
not, download the audio yourself and pass the file.

Examples:

    python fingerprint_set.py ~/sets/warmup.wav -o warmup.fps.json
    python fingerprint_set.py https://soundcloud.com/artist/some-mix -o mix.fps.json
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

from extraction import extract_panako_fingerprints


def is_url(value):
    return value.startswith('http://') or value.startswith('https://')


def download(url, target_dir):
    if shutil.which('yt-dlp') is None:
        sys.exit('yt-dlp is not installed: install it (e.g. `brew install yt-dlp`) '
                 'or download the audio yourself and pass the local file')
    template = os.path.join(target_dir, 'set.%(ext)s')
    subprocess.run(['yt-dlp', '--no-playlist', '-f', 'bestaudio', '-o', template, url], check=True)
    files = [f for f in os.listdir(target_dir) if f.startswith('set.')]
    if not files:
        sys.exit(f'yt-dlp produced no audio file for {url}')
    return os.path.join(target_dir, files[0])


# Panako decodes a whole file inside a JVM capped at 256 MB by its wrapper
# script; a 30-minute set stalls it. Five-minute chunks stay well inside
# that. A Panako hash spans < 0.3 s, so cutting loses only the hashes that
# straddle a cut.
CHUNK_SECONDS = 300


def extract_in_chunks(audio_path, total_seconds, temp_dir):
    fingerprints = []
    start = 0.0
    index = 0
    while start < total_seconds:
        chunk_path = os.path.join(temp_dir, f'chunk-{index:04d}.wav')
        # 16 kHz mono is what Panako resamples to anyway; a local file also
        # avoids decoding a network share twice (store + resolve/delete).
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-t', str(CHUNK_SECONDS),
             '-i', audio_path, '-vn', '-ac', '1', '-ar', '16000', chunk_path],
            check=True,
        )
        chunk = extract_panako_fingerprints(chunk_path)
        fingerprints.extend({'hash': fp['hash'], 'position': fp['position'] + start} for fp in chunk)
        os.remove(chunk_path)
        print(f'chunk {index}: {start:.0f}–{min(start + CHUNK_SECONDS, total_seconds):.0f} s, '
              f'{len(chunk)} fingerprints', file=sys.stderr)
        start += CHUNK_SECONDS
        index += 1
    return fingerprints


def duration_seconds(path):
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('source', help='Local audio file or URL of the set')
    parser.add_argument('-o', '--output', required=True, help='Fingerprint JSON to write')
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as temp_dir:
        audio_path = download(args.source, temp_dir) if is_url(args.source) else args.source
        if not os.path.exists(audio_path):
            sys.exit(f'Audio file does not exist: {audio_path}')
        total_seconds = duration_seconds(audio_path)
        fingerprints = extract_in_chunks(audio_path, total_seconds, temp_dir)
        if not fingerprints:
            sys.exit(f'No fingerprints extracted from {audio_path}')
        result = {
            'source': args.source,
            'durationSeconds': total_seconds,
            'fingerprints': fingerprints,
        }

    with open(args.output, 'w') as f:
        json.dump(result, f)
    print(f'Wrote {len(result["fingerprints"])} fingerprints '
          f'({result["durationSeconds"]:.0f} s of audio) to {args.output}', file=sys.stderr)


if __name__ == '__main__':
    main()
