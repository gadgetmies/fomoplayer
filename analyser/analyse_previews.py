"""Combined preview analyser: one download and one decode per stored preview.

The backend's prefetchPreviewAudio job stores preview audio in our bucket.
The separate workers (`panako_processor.py`, `main.py`, `waveform.py`) each
downloaded and decoded every stored preview themselves. This worker reads the
combined queue (`GET /admin/preview-analysis`), which says which analyses
each preview still needs, downloads and decodes each preview once, and runs
those analyses at the same time on the one WAV:

- embedding: one process, model built once (ONNX Runtime already uses every
  core for one inference);
- waveform: one process (matplotlib and the bucket client live there);
- fingerprints: `--fingerprint-workers` processes, each taking the WAVs that
  are ready, up to `--fingerprint-chunk`, into one Panako run. They return
  the fingerprints, and one upload thread here sends them to the backend one
  at a time (uploads are slow: each row is a random read of the backend's
  hash index), so a preview's WAV and in-flight slot are released when
  Panako is done, not when its upload is. At most
  `--max-fingerprint-in-flight` slots go to previews that need a
  fingerprint; the others go to previews that need only an embedding or a
  waveform, which then pass those waiting for slow uploads.

The stages are not run in lockstep: each works through previews at its own
pace, and a preview's WAV is deleted once every stage that needs it is done.
So the run takes about as long as its slowest stage, like the separate
workers, while new downloads wait whenever the WAVs on disk exceed
`--max-decoded-mb` or `--max-in-flight` previews.

Pausing: while the file named by ANALYSER_PAUSE_FILE exists (analyse_all.sh
toggles it from tmux), no queue fetch, download or Panako run starts; the
analyses already running and the queued uploads finish and are reported,
then the worker idles with its models loaded until the file is removed. It
writes `pausing: N running` or `paused` to `<file>.state` meanwhile.

Exit codes follow the other workers: 0 after processing, 2 when the queue is
empty (with `--loop --idle-wait S`, wait and ask again instead), others on
errors.
"""

from dotenv import load_dotenv

load_dotenv()

import argparse
import datetime
import glob
import itertools
import json
import multiprocessing
import os
import shutil
import sys
import tempfile
import time
import traceback
import urllib.request
from collections import deque
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, ThreadPoolExecutor, wait
from concurrent.futures.process import BrokenProcessPool

import requests

import analysis_stages
from analysis_reports import post_analysis, post_with_fallback
from audio_decode import to_wav
from auth import auth_header, get_api_url, request_error, resolve_url
from embedding_sanity import EmbeddingSanityChecker

# embedding.DEFAULT_MODEL; not imported because embedding imports the
# track_embedding package, which only the embedding process needs.
DEFAULT_MODEL = 'discogs_multi_embeddings-effnet-bs64-1'

DOWNLOAD_TIMEOUT_S = float(os.getenv("ANALYSER_DOWNLOAD_TIMEOUT_S", "60"))
API_TIMEOUT_S = 120
# A preview whose download or analysis failed is not tried again for this
# long within one run; it stays queued in the backend.
RETRY_AFTER_S = float(os.getenv("ANALYSER_RETRY_AFTER_S", "600"))
# Reports are sent at least this often, so results reach the backend and
# stored files are released promptly.
REPORT_INTERVAL_S = float(os.getenv("ANALYSER_REPORT_INTERVAL_S", "30"))
# How often a pause flag is looked for, in seconds.
PAUSE_POLL_S = 2
# A preview that fails to decode, or whose waveform fails, this many times is
# reported missing, as waveform.py and the prefetch job do.
MAX_ATTEMPTS = 3

EMBEDDING, WAVEFORM, FINGERPRINT = 'embedding', 'waveform', 'fingerprint'


def log(message):
    print(f"[{datetime.datetime.now()}] {message}", flush=True)


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument("-m", "--model", default=DEFAULT_MODEL, help="Embedding model")
    ap.add_argument("-b", "--batch-size", type=int, default=20, help="Previews fetched from the queue at a time")
    ap.add_argument("--loop", action="store_true",
                    help="Keep fetching until the queue is empty, then exit 2 (or wait, with --idle-wait)")
    ap.add_argument("--idle-wait", type=float, default=0,
                    help="With --loop: on an empty queue wait this many seconds and ask again, models loaded")
    ap.add_argument("--download-workers", type=int, default=4, help="Parallel downloads and decodes")
    ap.add_argument("--fingerprint-workers", type=int, default=4, help="Parallel Panako processes")
    ap.add_argument("--fingerprint-chunk", type=int, default=8,
                    help="Most WAVs one Panako run takes (it takes what is ready, up to this)")
    ap.add_argument("--max-decoded-mb", type=float, default=1024,
                    help="No new download starts while the WAVs not yet deleted exceed this")
    ap.add_argument("--max-in-flight", type=int, default=16,
                    help="Most previews between download and deletion at once")
    ap.add_argument("--max-fingerprint-in-flight", type=int,
                    help="Most in-flight previews that need a fingerprint (default: half of --max-in-flight), "
                         "so previews needing only other analyses are not stuck behind slow uploads")
    ap.add_argument("--max-queued-uploads", type=int, default=8,
                    help="No new Panako run starts while this many previews wait for their fingerprint upload")
    ap.add_argument("--no-waveform", action="store_true",
                    help="Skip waveforms (when the WAVEFORM_STORAGE_* variables are not configured)")
    ap.add_argument("--work-dir", help="Where downloads and WAVs go (default: a temporary directory). "
                                       "Leftovers of a killed run there are deleted on start.")
    ap.add_argument("--sanity-window", type=int, default=20,
                    help="Recent embeddings compared to catch bit-identical duplicates. 0 disables the check.")
    ap.add_argument("--skip-sanity-confirmation", action="store_true",
                    help="Log embedding collisions instead of asking y/N (for unattended runs)")
    args = ap.parse_args(argv)
    if args.max_fingerprint_in_flight is None:
        args.max_fingerprint_in_flight = max(1, args.max_in_flight // 2)
    return args


def download(url, path):
    """Download url to path, giving up after DOWNLOAD_TIMEOUT_S without data."""
    with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT_S) as response, open(path, "wb") as out:
        shutil.copyfileobj(response, out)


class DownloadFailed(Exception):
    pass


def prepare(preview, work_dir):
    """Download a stored preview and decode it to a WAV, deleting the
    download. Runs on a download thread. Returns `(wav_path, size_bytes)`."""
    preview_id = preview['preview_id']
    mp3_path = os.path.join(work_dir, f"preview_{preview_id}.mp3")
    wav_path = os.path.join(work_dir, f"preview_{preview_id}.wav")
    try:
        try:
            download(resolve_url(preview['audio_url']), mp3_path)
        except Exception as e:
            raise DownloadFailed(str(e)) from e
        to_wav(mp3_path, wav_path)
        return wav_path, os.path.getsize(wav_path)
    except Exception:
        if os.path.exists(wav_path):
            os.remove(wav_path)
        raise
    finally:
        if os.path.exists(mp3_path):
            os.remove(mp3_path)


class Item:
    def __init__(self, preview, no_waveform):
        self.preview = preview
        self.id = preview['preview_id']
        self.needs = {stage for stage, flag in ((FINGERPRINT, preview.get('needs_fingerprint')),
                                                (EMBEDDING, preview.get('needs_embedding')),
                                                (WAVEFORM, preview.get('needs_waveform') and not no_waveform))
                      if flag}
        self.pending = set()
        self.wav = None
        self.wav_bytes = 0


class Analyser:
    def __init__(self, args, work_dir):
        self.args = args
        self.work_dir = work_dir
        self.spawn = multiprocessing.get_context('spawn')
        self.sanity = EmbeddingSanityChecker(args.sanity_window, args.skip_sanity_confirmation)
        self.downloads = ThreadPoolExecutor(max_workers=max(1, args.download_workers),
                                            thread_name_prefix='download')
        self.pools = {}
        # One thread: uploads are serialised machine-wide by .upload_lock anyway.
        self.uploads = ThreadPoolExecutor(max_workers=1, thread_name_prefix='upload')
        self.uploading = set()        # ids whose fingerprints are queued for or being uploaded
        self.seq = itertools.count()
        self.pending = deque()        # Items waiting for a download
        self.active = {}              # id -> Item, from download start until its WAV is deleted
        self.futures = {}             # future -> (seq, kind, items)
        self.fingerprint_ready = deque()
        self.fingerprints_running = 0
        self.decoded_bytes = 0
        self.retry_until = {}
        self.attempts = {}
        self.analyse_entries = []
        self.waveform_entries = []
        self.last_report = time.monotonic()
        self.queue_dry = False
        self.done = 0
        self.stats = {EMBEDDING: 0, WAVEFORM: 0, FINGERPRINT: 0, 'missing': 0, 'downloads': 0}
        self.pause_file = os.getenv('ANALYSER_PAUSE_FILE') or None
        self.pause_state = None

    # --- pause ---

    def paused(self):
        return bool(self.pause_file) and os.path.exists(self.pause_file)

    def set_pause_state(self, text):
        """Write `text` to `<pause file>.state` (None removes it), only when it changes."""
        if text == self.pause_state:
            return
        path = f"{self.pause_file}.state"
        if text is None:
            if os.path.exists(path):
                os.remove(path)
            log("Resumed")
        else:
            with open(f"{path}.tmp", "w") as f:
                f.write(text + "\n")
            os.replace(f"{path}.tmp", path)
            if text == 'paused':
                log(f"Paused; remove {self.pause_file} (or toggle it in tmux) to resume")
        self.pause_state = text

    def drain_while_paused(self):
        """While paused: let running work finish and report it, then idle.
        Returns once the pause file is gone."""
        while self.paused():
            if self.futures:
                self.set_pause_state(f"pausing: {len(self.futures)} running")
                done, _ = wait(list(self.futures), timeout=PAUSE_POLL_S, return_when=FIRST_COMPLETED)
                self.handle(done)
                if time.monotonic() - self.last_report >= REPORT_INTERVAL_S:
                    self.report()
                continue
            self.report()
            self.set_pause_state('paused')
            time.sleep(PAUSE_POLL_S)
        if self.pause_state is not None:
            self.set_pause_state(None)

    def sleep(self, seconds):
        """Sleep, returning early when a pause starts."""
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline and not self.paused():
            time.sleep(min(PAUSE_POLL_S, max(0, deadline - time.monotonic())))

    # --- stage pools, started on first use ---

    def pool(self, stage):
        if stage not in self.pools:
            if stage == EMBEDDING:
                self.pools[stage] = ProcessPoolExecutor(1, mp_context=self.spawn,
                                                        initializer=analysis_stages.init_embedding,
                                                        initargs=(self.args.model,))
            elif stage == WAVEFORM:
                # The initializer connects to the bucket: a missing or wrong
                # configuration stops the worker instead of failing (and
                # eventually marking missing) every preview.
                self.pools[stage] = ProcessPoolExecutor(1, mp_context=self.spawn,
                                                        initializer=analysis_stages.init_waveform)
            else:
                self.pools[stage] = ProcessPoolExecutor(max(1, self.args.fingerprint_workers),
                                                        mp_context=self.spawn)
        return self.pools[stage]

    def submit(self, kind, items, executor, fn, *fn_args):
        future = executor.submit(fn, *fn_args)
        self.futures[future] = (next(self.seq), kind, items)

    # --- queue ---

    def blocked(self, preview_id):
        return self.retry_until.get(preview_id, 0) > time.monotonic()

    def retry_later(self, item):
        self.retry_until[item.id] = time.monotonic() + RETRY_AFTER_S

    def fetch(self):
        """Ask the queue for more previews. Returns how many new ones were
        queued. Reports are sent first, so the queue reflects them."""
        self.report()
        skip = set(self.active) | self.uploading | {i.id for i in self.pending}
        skip |= {pid for pid in self.retry_until if self.blocked(pid)}
        limit = min(self.args.batch_size + len(skip), 500)
        res = requests.get(f"{get_api_url()}/admin/preview-analysis?limit={limit}&model={self.args.model}",
                           headers=auth_header(), timeout=API_TIMEOUT_S)
        if res.status_code != 200:
            raise Exception(request_error("Preview analysis queue request", res))
        new = 0
        for preview in res.json():
            if preview['preview_id'] in skip or not preview.get('audio_url'):
                continue
            item = Item(preview, self.args.no_waveform)
            if not item.needs:
                continue
            self.pending.append(item)
            new += 1
            if new >= self.args.batch_size:
                break
        self.queue_dry = new == 0
        log(f"Queue: {new} new preview(s)")
        return new

    # --- downloads ---

    def fingerprints_full(self):
        """True while --max-fingerprint-in-flight previews that need a
        fingerprint hold a slot: then only previews that do not need one
        start, so they are not stuck behind slow fingerprint uploads."""
        holding = sum(1 for item in self.active.values() if FINGERPRINT in item.needs)
        return holding >= self.args.max_fingerprint_in_flight

    def next_download(self):
        """The oldest pending preview that may start now, removed from
        pending, or None."""
        skip_fingerprints = self.fingerprints_full()
        for index, item in enumerate(self.pending):
            if not (skip_fingerprints and FINGERPRINT in item.needs):
                del self.pending[index]
                return item
        return None

    def downloadable(self):
        skip_fingerprints = self.fingerprints_full()
        return sum(1 for item in self.pending if not (skip_fingerprints and FINGERPRINT in item.needs))

    def start_downloads(self):
        budget = self.args.max_decoded_mb * 1e6
        downloading = sum(1 for _, kind, _ in self.futures.values() if kind == 'download')
        while (downloading < self.args.download_workers
               and len(self.active) < self.args.max_in_flight and self.decoded_bytes < budget):
            item = self.next_download()
            if item is None:
                break
            self.active[item.id] = item
            self.submit('download', [item], self.downloads, prepare, item.preview, self.work_dir)
            downloading += 1

    def on_prepared(self, item, future):
        try:
            item.wav, item.wav_bytes = future.result()
        except DownloadFailed as e:
            # Our own bucket failing is transient: keep the preview queued.
            log(f"Downloading preview {item.id} failed: {e}")
            self.retry_later(item)
            del self.active[item.id]
            return
        except Exception as e:
            self.count_failure(item, f"decoding failed: {e}")
            del self.active[item.id]
            return
        self.stats['downloads'] += 1
        self.decoded_bytes += item.wav_bytes
        item.pending = set(item.needs)
        if EMBEDDING in item.needs:
            self.submit(EMBEDDING, [item], self.pool(EMBEDDING), analysis_stages.embed, item.wav)
        if WAVEFORM in item.needs:
            png = os.path.join(self.work_dir, f"waveform_{item.id}.png")
            self.submit(WAVEFORM, [item], self.pool(WAVEFORM), analysis_stages.render_waveform, item.wav, png)
        if FINGERPRINT in item.needs:
            self.fingerprint_ready.append(item)

    def dispatch_fingerprints(self):
        # A free process takes everything ready, up to the chunk size: small
        # chunks while fingerprinting keeps up, full ones when it falls behind.
        while (self.fingerprint_ready and self.fingerprints_running < self.args.fingerprint_workers
               and len(self.uploading) < self.args.max_queued_uploads):
            chunk = [self.fingerprint_ready.popleft()
                     for _ in range(min(self.args.fingerprint_chunk, len(self.fingerprint_ready)))]
            self.submit(FINGERPRINT, chunk, self.pool(FINGERPRINT), analysis_stages.fingerprint_chunk,
                        [{'id': i.id, 'wav': i.wav} for i in chunk])
            self.fingerprints_running += 1

    # --- results ---

    def count_failure(self, item, reason):
        self.attempts[item.id] = self.attempts.get(item.id, 0) + 1
        log(f"Preview {item.id}: {reason} (attempt {self.attempts[item.id]}/{MAX_ATTEMPTS})")
        if self.attempts[item.id] >= MAX_ATTEMPTS:
            self.report_missing(item)
        else:
            self.retry_later(item)

    def report_missing(self, item):
        self.analyse_entries.append({"preview_id": item.id, "missing": True})
        self.stats['missing'] += 1

    def on_embedding(self, item, future):
        try:
            vector, duration = future.result()
        except BrokenProcessPool:
            raise
        except Exception as e:
            log(f"Embedding preview {item.id} failed: {e!r}")
            self.retry_later(item)
            return
        if vector is None:
            # Too short for a single model patch: leave the queue, as main.py does.
            log(f"Audio too short to embed ({duration:.1f} s), reporting preview {item.id} missing")
            self.report_missing(item)
            return
        track_id = item.preview.get('track_id')
        label = f"track_id={track_id}" if track_id is not None else None
        if not self.sanity.record_and_check(item.id, vector, label=label, group_key=track_id):
            self.report()
            raise SystemExit(1)
        self.analyse_entries.append({"id": item.id, "embeddings": json.dumps(vector),
                                     "model": self.args.model, "spotify": {}})
        self.stats[EMBEDDING] += 1

    def on_waveform(self, item, future):
        try:
            url = future.result()
        except BrokenProcessPool:
            raise
        except Exception as e:
            # Counted as waveform.py counts them: the third failure reports it missing.
            self.count_failure(item, f"waveform failed: {e!r}")
            return
        self.waveform_entries.append({"id": item.id, "waveform_url": url,
                                      "waveform_start_ms": item.preview.get('preview_start_ms'),
                                      "waveform_end_ms": item.preview.get('preview_end_ms')})
        self.stats[WAVEFORM] += 1

    def on_fingerprints(self, items, future):
        self.fingerprints_running -= 1
        try:
            results = {r['id']: r for r in future.result()}
        except BrokenProcessPool:
            raise
        except Exception as e:
            results = {i.id: {'error': repr(e)} for i in items}
        for item in items:
            result = results.get(item.id, {'error': 'no result'})
            if result.get('error'):
                log(f"Fingerprinting preview {item.id} failed: {result['error']}")
                self.retry_later(item)
            else:
                self.uploading.add(item.id)
                self.submit('upload', [item], self.uploads, analysis_stages.upload_fingerprints,
                            item.id, result['fingerprints'])

    def on_uploaded(self, item, future):
        self.uploading.discard(item.id)
        try:
            future.result()
        except Exception as e:
            # Stays queued in the backend; tried again after RETRY_AFTER_S.
            log(f"Uploading fingerprints of preview {item.id} failed: {e}")
            self.retry_later(item)
            return
        self.stats[FINGERPRINT] += 1

    def stage_done(self, item, stage):
        item.pending.discard(stage)
        if not item.pending:
            os.remove(item.wav)
            self.decoded_bytes -= item.wav_bytes
            del self.active[item.id]
            self.done += 1
            self.queue_dry = False

    def handle(self, done):
        # In submission order, so embeddings reach the sanity check in queue order.
        for future in sorted(done, key=lambda f: self.futures[f][0]):
            _, kind, items = self.futures.pop(future)
            if kind == 'download':
                self.on_prepared(items[0], future)
                continue
            if kind == 'upload':
                self.on_uploaded(items[0], future)
                continue
            if kind == EMBEDDING:
                self.on_embedding(items[0], future)
            elif kind == WAVEFORM:
                self.on_waveform(items[0], future)
            else:
                self.on_fingerprints(items, future)
            for item in items:
                self.stage_done(item, kind)

    def report(self):
        if self.analyse_entries:
            post_analysis(self.analyse_entries)
            self.analyse_entries = []
        if self.waveform_entries:
            post_with_fallback('/admin/waveform', self.waveform_entries)
            self.waveform_entries = []
        self.last_report = time.monotonic()

    def busy(self):
        return bool(self.futures or self.pending or self.fingerprint_ready)

    def run(self):
        """Returns the exit code."""
        args = self.args
        self.drain_while_paused()
        if self.fetch() == 0 and not (args.loop and args.idle_wait > 0):
            log("No previews to analyse")
            return 2
        while True:
            self.drain_while_paused()
            # Previews waiting for a fingerprint slot stay pending, so count
            # the ones that could start.
            if args.loop and self.downloadable() < args.download_workers and not self.queue_dry:
                self.fetch()
            self.start_downloads()
            self.dispatch_fingerprints()
            if not self.busy():
                self.report()
                log(f"Analysed {self.done} preview(s): {self.stats}")
                if not args.loop:
                    return 0
                if self.fetch():
                    continue
                if args.idle_wait <= 0:
                    return 2
                log(f"No previews to analyse, checking again in {args.idle_wait:g} s")
                self.sleep(args.idle_wait)
                self.queue_dry = False
                continue
            # Short enough to notice a pause promptly.
            done, _ = wait(list(self.futures), timeout=min(REPORT_INTERVAL_S, PAUSE_POLL_S),
                           return_when=FIRST_COMPLETED)
            self.handle(done)
            if time.monotonic() - self.last_report >= REPORT_INTERVAL_S:
                self.report()
                log(f"Progress: {self.done} preview(s) done, {len(self.active)} in flight, "
                    f"{len(self.uploading)} awaiting upload, "
                    f"{self.decoded_bytes / 1e6:.0f} MB decoded on disk, {self.stats}")

    def close(self):
        self.downloads.shutdown(wait=True, cancel_futures=True)
        for pool in self.pools.values():
            pool.shutdown(wait=True, cancel_futures=True)
        # Queued uploads are dropped: those previews stay queued in the backend.
        self.uploads.shutdown(wait=True, cancel_futures=True)


# The files this worker writes into its work folder.
LEFTOVER_PATTERNS = ('preview_*.mp3', 'preview_*.wav', 'waveform_*.png')


def remove_leftovers(work_dir):
    """Delete the files a killed run left in a fixed work folder (a clean
    exit leaves none), and nothing else there. Returns how many."""
    removed = 0
    for pattern in LEFTOVER_PATTERNS:
        for path in glob.glob(os.path.join(work_dir, pattern)):
            os.remove(path)
            removed += 1
    return removed


def main(argv=None):
    args = parse_args(argv)
    log("Starting")
    work_dir_context = tempfile.TemporaryDirectory(prefix='analyse_previews_') if not args.work_dir else None
    work_dir = args.work_dir or work_dir_context.name
    os.makedirs(work_dir, exist_ok=True)
    if args.work_dir:
        removed = remove_leftovers(work_dir)
        if removed:
            log(f"Deleted {removed} leftover file(s) from {work_dir}")
    analyser = Analyser(args, work_dir)
    try:
        code = analyser.run()
    except BrokenProcessPool:
        log("An analysis process died; exiting so the driver restarts the worker")
        traceback.print_exc()
        analyser.report()
        code = 1
    finally:
        analyser.close()
        if work_dir_context:
            work_dir_context.cleanup()
    return code


if __name__ == '__main__':
    sys.exit(main())
