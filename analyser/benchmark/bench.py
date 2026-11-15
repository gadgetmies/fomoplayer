"""Measure how fast this machine runs the analyser's three preview workers
(embedding, waveform, fingerprint) and project how many tracks a day it can
keep up with.

Each stage runs single-threaded, the way one worker per core would, and does
the same work as the production worker: decode the MP3 to WAV with pydub,
then run the same model / drawing / Panako code. Nothing is downloaded from or
uploaded to Fomo Player.

    python benchmark/bench.py                      # synthetic 2- and 6-min tracks
    python benchmark/bench.py --audio-dir /audio   # your own MP3s instead
"""
import os

# Pin every numeric library to one thread before any of them is imported, so
# the timings are per core.
for var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS",
            "TF_NUM_INTRAOP_THREADS", "TF_NUM_INTEROP_THREADS"):
    os.environ.setdefault(var, "1")

import argparse
import glob
import resource
import shutil
import subprocess
import sys
import tempfile
import time
import types

ANALYSER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ANALYSER_DIR)
os.chdir(ANALYSER_DIR)  # main.build_model reads ./models/

import matplotlib
matplotlib.use("Agg")

# waveform.py connects to the waveform bucket when imported. The benchmark only
# draws images, so give it a stand-in client that reports the bucket exists.
class _NoStorage:
    def __init__(self, *args, **kwargs):
        pass

    def bucket_exists(self, bucket):
        return True

sys.modules["minio"] = types.SimpleNamespace(Minio=_NoStorage)
os.environ.setdefault("WAVEFORM_STORAGE_HOST", "unused.invalid")

import essentia
from essentia.standard import MonoLoader, TensorflowPredictEffnetDiscogs
from pydub import AudioSegment
from waveform import generate_waveform
from extraction import PANAKO_JAVA_OPTIONS, PREVIEW_MAX_DURATION_S, _batched_panako_store

# MonoLoader logs a harmless "No network created" warning on every reset.
essentia.log.warningActive = False

MODEL = "discogs_multi_embeddings-effnet-bs64-1"
SECONDS_PER_DAY = 86400


def synthetic_tracks(out_dir):
    """Three Beatport-length (2 min) and three Bandcamp-length (6 min) MP3s:
    pink noise with a kick-like pulse, so Panako finds peaks to fingerprint."""
    paths = []
    for i, seconds in enumerate((120, 120, 120, 360, 360, 360)):
        path = os.path.join(out_dir, f"synthetic_{i}_{seconds}s.mp3")
        subprocess.run([
            "ffmpeg", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", f"anoisesrc=d={seconds}:c=pink:a=0.25:seed={i + 1}",
            "-f", "lavfi", "-i", f"sine=f={55 + 10 * i}:d={seconds}",
            "-filter_complex",
            "[1]volume='if(lt(mod(t,0.5),0.08),1,0)':eval=frame[k];[0][k]amix=inputs=2",
            "-ac", "2", "-ar", "44100", "-b:a", "320k", path,
        ], check=True)
        paths.append(path)
    return paths


def to_wav(mp3_path, wav_path, max_seconds=None):
    if max_seconds:
        sound = AudioSegment.from_file(mp3_path, duration=max_seconds)
    else:
        sound = AudioSegment.from_mp3(mp3_path)
    sound.export(wav_path, format="wav")
    return len(sound) / 1000.0


def timed(fn):
    start = time.perf_counter()
    result = fn()
    return time.perf_counter() - start, result


def peak_rss_mb():
    # ru_maxrss is in kilobytes on Linux.
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--audio-dir", help="Folder of MP3s to use instead of synthetic tracks")
    ap.add_argument("--limit", type=int, default=6, help="Use at most this many files from --audio-dir")
    ap.add_argument("--skip-panako", action="store_true", help="Skip the fingerprint stage")
    ap.add_argument("--cores", type=int, nargs="+", default=[1, 2],
                    help="Core counts to project daily capacity for")
    args = ap.parse_args()

    work = tempfile.mkdtemp(prefix="analyser-bench-")
    try:
        if args.audio_dir:
            files = sorted(glob.glob(os.path.join(args.audio_dir, "**", "*.mp3"), recursive=True))[:args.limit]
            if not files:
                sys.exit(f"No .mp3 files under {args.audio_dir}")
        else:
            print("Generating synthetic tracks…", flush=True)
            files = synthetic_tracks(work)

        print("Loading the embedding model…", flush=True)
        model = TensorflowPredictEffnetDiscogs(graphFilename=f"./models/{MODEL}.pb", output="PartitionedCall:1")
        model(MonoLoader(filename=files[0], sampleRate=16000, resampleQuality=4)()[:16000 * 10])  # warm-up

        totals = {"embedding": 0.0, "waveform": 0.0, "fingerprint": 0.0}
        audio_seconds = 0.0
        panako_inputs = []

        for i, mp3 in enumerate(files):
            wav = os.path.join(work, f"track_{i}.wav")

            # Embedding worker (main.py): MP3 -> WAV, 16 kHz load, model.
            t_embed, seconds = timed(lambda: (
                to_wav(mp3, wav),
                model(MonoLoader(filename=wav, sampleRate=16000, resampleQuality=4)()),
            )[0])

            # Waveform worker (waveform.py): MP3 -> WAV, draw the PNG.
            t_wave, _ = timed(lambda: (to_wav(mp3, wav), generate_waveform(wav, os.path.join(work, f"wave_{i}.png"))))

            # Fingerprint worker (extraction.py): capped MP3 -> WAV here,
            # Panako itself runs once for the whole batch below.
            fp_wav = os.path.join(work, f"fp_{i}.wav")
            t_fp_decode, _ = timed(lambda: to_wav(mp3, fp_wav, PREVIEW_MAX_DURATION_S))
            panako_inputs.append(fp_wav)

            audio_seconds += seconds
            totals["embedding"] += t_embed
            totals["waveform"] += t_wave
            totals["fingerprint"] += t_fp_decode
            print(f"  {os.path.basename(mp3)} ({seconds / 60:.1f} min): "
                  f"embedding {t_embed:.1f}s, waveform {t_wave:.1f}s", flush=True)

        if args.skip_panako:
            totals.pop("fingerprint")
        elif shutil.which("panako") is None:
            sys.exit("panako is not on PATH; run inside the benchmark container or pass --skip-panako")
        else:
            cache_dir = os.path.join(work, "panako_cache")
            os.makedirs(cache_dir)
            t_panako, _ = timed(lambda: _batched_panako_store(panako_inputs, cache_dir))
            totals["fingerprint"] += t_panako
            print(f"  Panako, all {len(files)} files in one batch: {t_panako:.1f}s", flush=True)

        minutes = audio_seconds / 60
        per_minute = {stage: t / minutes for stage, t in totals.items()}
        all_stages = sum(per_minute.values())

        print(f"\nCPU seconds per minute of audio ({minutes:.0f} min analysed, one core):")
        for stage, s in per_minute.items():
            print(f"  {stage:<12} {s:6.2f}")
        print(f"  {'all':<12} {all_stages:6.2f}")
        if args.skip_panako:
            print("  (fingerprinting skipped, so the figures below leave it out)")

        print("\nTracks per day, all three analyses, if the cores are kept busy:")
        for cores in args.cores:
            beatport = cores * SECONDS_PER_DAY / (all_stages * 2)
            bandcamp = cores * SECONDS_PER_DAY / (all_stages * 6)
            print(f"  {cores} core(s): ~{beatport:,.0f} two-minute previews or ~{bandcamp:,.0f} six-minute tracks")

        print(f"\nPeak memory of the embedding and waveform steps: {peak_rss_mb()} MB. "
              f"Panako runs in its own Java process, capped at {PANAKO_JAVA_OPTIONS}.")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
