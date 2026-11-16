"""Compare the combined preview worker with the three separate workers.

Runs both setups on the same generated previews against a stub backend
(`analysis_fakes.StubBackend`) and prints, for each: wall time until every
preview has all its analyses, downloads served, and the peak size of the
decoded/downloaded audio on disk.

Panako is replaced by a stand-in that burns CPU like it (start-up and per
second of audio, see --panako-*), unless --real-panako is given. Embeddings
and waveforms are real. Do not run this on a host where analyser workers are
running: the separate fingerprint worker cleans `analyser/downloads/`.

    python bench_preview_workers.py --previews 16 --tracks 8
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time

import analysis_fakes
from analysis_fakes import Preview, StubBackend

ANALYSER_DIR = os.path.dirname(os.path.abspath(__file__))


def mp3(path, seconds):
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
                    f'anoisesrc=d={seconds}:c=pink:seed=1', '-ac', '2', '-ar', '44100', '-b:a', '128k', path],
                   check=True)
    with open(path, 'rb') as f:
        return f.read()


def dataset(work, previews, tracks):
    short, long_ = mp3(os.path.join(work, 'preview.mp3'), 120), mp3(os.path.join(work, 'track.mp3'), 360)
    items = [Preview(i, i, 'Beatport', short) for i in range(1, previews + 1)]
    items += [Preview(previews + i, previews + i, 'Bandcamp', long_) for i in range(1, tracks + 1)]
    return items


class DiskSampler:
    """Peak bytes of .mp3/.wav/.LOFI files and extensionless downloads under the given dirs."""

    def __init__(self, dirs):
        self.dirs, self.peak, self.stop = dirs, 0, threading.Event()
        threading.Thread(target=self.run, daemon=True).start()

    def run(self):
        while not self.stop.is_set():
            total = 0
            for d in self.dirs:
                for root, _, files in os.walk(d):
                    for name in files:
                        if name.endswith(('.wav', '.mp3', '.tmp')) or name.startswith('preview_'):
                            try:
                                total += os.path.getsize(os.path.join(root, name))
                            except OSError:
                                pass
            self.peak = max(self.peak, total)
            time.sleep(0.2)


def drained(backend):
    return all(not p.needs(a) for p in backend.previews.values() for a in p.has)


def run_until_drained(commands, backend, env, cwd):
    """Start each command in a loop (re-run while it exits 0) until the
    backend has every analysis. Returns the wall time."""
    start = time.monotonic()
    stop = threading.Event()

    def loop(cmd):
        while not stop.is_set():
            rc = subprocess.run(cmd, cwd=cwd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
            if rc == 2 or drained(backend):
                return
            if rc != 0:
                print(f"  {os.path.basename(cmd[1])} exited {rc}", flush=True)
                time.sleep(1)

    threads = [threading.Thread(target=loop, args=(c,)) for c in commands]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    stop.set()
    elapsed = time.monotonic() - start
    if not drained(backend):
        print("  WARNING: not every analysis was reported", flush=True)
    return elapsed


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--previews', type=int, default=16, help='2-minute Beatport-like previews')
    ap.add_argument('--tracks', type=int, default=8, help='6-minute Bandcamp-like full tracks')
    ap.add_argument('--real-panako', action='store_true', help='Use the panako on PATH')
    ap.add_argument('--panako-startup-s', type=float, default=1.0, help='Stand-in CPU seconds per Panako run')
    ap.add_argument('--panako-cpu-per-audio-s', type=float, default=0.02,
                    help='Stand-in CPU seconds per second of audio fingerprinted')
    ap.add_argument('--only', choices=['separate', 'combined'])
    args = ap.parse_args()

    work = tempfile.mkdtemp(prefix='bench_preview_workers_')
    try:
        fakes = os.path.join(work, 'fakes')
        os.makedirs(fakes)
        if not args.real_panako:
            analysis_fakes.write_fake_panako(fakes)
        analysis_fakes.write_fake_minio(fakes)
        uploads = os.path.join(work, 'uploads')
        os.makedirs(uploads)
        items = dataset(work, args.previews, args.tracks)
        env = dict(os.environ,
                   PATH=f"{fakes}{os.pathsep}{os.environ['PATH']}",
                   PYTHONPATH=os.pathsep.join([fakes, ANALYSER_DIR]),
                   FAKE_MINIO_DIR=uploads, FOMOPLAYER_API_KEY='fp_bench',
                   FAKE_PANAKO_STARTUP_S=str(args.panako_startup_s),
                   FAKE_PANAKO_CPU_PER_AUDIO_SECOND=str(args.panako_cpu_per_audio_s),
                   WAVEFORM_STORAGE_HOST='bucket.invalid', WAVEFORM_STORAGE_BUCKET_NAME='waveforms',
                   WAVEFORM_STORAGE_BUCKET_ACCESS_KEY='k', WAVEFORM_STORAGE_BUCKET_SECRET_KEY='s',
                   SPOTIPY_CLIENT_ID='bench', SPOTIPY_CLIENT_SECRET='bench', TF_CPP_MIN_LOG_LEVEL='3',
                   NO_PROXY='127.0.0.1', no_proxy='127.0.0.1')
        py = sys.executable
        setups = {
            'separate': [
                [py, os.path.join(ANALYSER_DIR, 'panako_processor.py'), '--previews', '-b', '200',
                 '--workers', '4', '--score-after', '0'],
                [py, os.path.join(ANALYSER_DIR, 'main.py'), '--loop', '--skip-sanity-confirmation',
                 '--sanity-window', '0'],
                [py, os.path.join(ANALYSER_DIR, 'waveform.py'), '--loop'],
            ],
            'combined': [
                [py, os.path.join(ANALYSER_DIR, 'analyse_previews.py'), '--loop', '--skip-sanity-confirmation',
                 '--sanity-window', '0'],
            ],
        }
        print(f"{args.previews} x 2 min previews + {args.tracks} x 6 min tracks, {os.cpu_count()} CPUs, "
              f"Panako {'real' if args.real_panako else f'stand-in ({args.panako_startup_s} s/run, '
                                                         f'{args.panako_cpu_per_audio_s} s/audio s)'}",
              flush=True)
        for name, commands in setups.items():
            if args.only and name != args.only:
                continue
            for item in items:
                item.has = {'fingerprint': False, 'embedding': False, 'waveform': item.store != 'Bandcamp'}
                item.missing = False
            backend = StubBackend(items)
            tmpdir = os.path.join(work, f'tmp-{name}')
            os.makedirs(tmpdir)
            sampler = DiskSampler([tmpdir, os.path.join(ANALYSER_DIR, 'downloads')])
            try:
                elapsed = run_until_drained(commands, backend, dict(env, FOMOPLAYER_API_URL=backend.api_url,
                                                                    TMPDIR=tmpdir), work)
            finally:
                sampler.stop.set()
                backend.close()
            print(f"{name:>9}: {elapsed:6.1f} s, {sum(backend.downloads.values())} downloads, "
                  f"peak audio on disk {sampler.peak / 1e6:.0f} MB", flush=True)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
