"""One status line of preview analysis progress, for the analyser's tmux bar.

Counts the previews of the prefetched stores (the ones the backend's
prefetchPreviewAudio job stores in the bucket) from the production database:
in total, not yet analysed, not yet analysed with their audio in the bucket,
and ignored: not analysed and never going to be downloaded, so they are left
out of what is left. "Analysed" mirrors `analysedCondition` in
packages/back/routes/admin/preview-audio.js and "ignored" mirrors the filters
of `queryPreviewsToPrefetch` there; keep them in sync.

`--part counts` and `--part rate` print one half each, for two short status
lines. tmux runs this every status-interval, so the counts are cached in a file and
the database is asked at most once per `--refresh` seconds. The rate is the
growth of the analysed count over about the last hour (new previews arriving
do not hide progress), and the estimate is what is left at that rate.

The database URL comes from ANALYSIS_PROGRESS_DATABASE_URL, or else from
`railway variables` for the pgvector service (run in this directory, which
must be linked to the Railway project).
"""

import argparse
import fcntl
import json
import os
import subprocess
import sys
import tempfile
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Mirror PREFETCH_STORES, WAVEFORM_STORES and PRODUCTION_EMBEDDING_TYPE in preview-audio.js.
COUNT_SQL = """
SELECT count(*) AS total
     , count(*) FILTER (WHERE NOT analysed AND NOT ignored) AS remaining
     , count(*) FILTER (WHERE NOT analysed AND stored) AS in_bucket
     , count(*) FILTER (WHERE NOT analysed AND ignored) AS ignored
FROM (SELECT a.store__track_preview_audio_object_key IS NOT NULL AS stored
           , (p.store__track_preview_missing
              OR (EXISTS (SELECT 1 FROM store__track_preview_fingerprint_meta m
                          WHERE m.store__track_preview_id = p.store__track_preview_id)
                  AND EXISTS (SELECT 1 FROM store__track_preview_embedding e
                              WHERE e.store__track_preview_id = p.store__track_preview_id
                                AND e.store__track_preview_embedding_type = 'discogs_multi_embeddings-effnet-bs64-1')
                  AND (s.store_name <> 'Bandcamp'
                       OR EXISTS (SELECT 1 FROM store__track_preview_waveform w
                                  WHERE w.store__track_preview_id = p.store__track_preview_id
                                    AND w.store__track_preview_waveform_url IS NOT NULL)))) AS analysed
           -- Not in the bucket and never downloaded by the prefetch job:
           , (a.store__track_preview_audio_object_key IS NULL
              -- larger than its size limit (DJ mixes),
              AND (a.store__track_preview_audio_last_error = 'Too large to prefetch'
                   -- on a Bandcamp custom domain that redirects back and forth for
                   -- non-browser clients (retried hourly, never marked missing),
                   OR a.store__track_preview_audio_last_error LIKE '%redirect count exceeded%'
                   -- or with nothing to download from.
                   OR (s.store_name <> 'Bandcamp' AND p.store__track_preview_url IS NULL)
                   OR (s.store_name = 'Bandcamp'
                       AND NOT EXISTS (SELECT 1 FROM release__track rt
                                         JOIN store__release sr ON sr.release_id = rt.release_id
                                       WHERE rt.track_id = st.track_id
                                         AND sr.store_id = s.store_id)))) AS ignored
      FROM store__track_preview p
        JOIN store__track st ON st.store__track_id = p.store__track_id
        JOIN store s ON s.store_id = st.store_id
        LEFT JOIN store__track_preview_audio a ON a.store__track_preview_id = p.store__track_preview_id
      WHERE s.store_name IN ('Bandcamp', 'Beatport')) previews
"""

# The rate is measured against the newest sample at least this old...
RATE_WINDOW_S = 3600
# ...or the oldest one, once it is at least this old.
MIN_RATE_SPAN_S = 600
# Samples older than this are dropped from the cache.
HISTORY_S = 6 * 3600


def default_cache_path():
    return os.path.join(tempfile.gettempdir(), f"fomoplayer-analysis-progress-{os.getuid()}.json")


def database_url():
    url = os.getenv("ANALYSIS_PROGRESS_DATABASE_URL")
    if url:
        return url
    environment = os.getenv("ANALYSIS_PROGRESS_RAILWAY_ENVIRONMENT", "production")
    out = subprocess.run(["railway", "variables", "-s", "pgvector", "-e", environment, "--kv"],
                         cwd=SCRIPT_DIR, capture_output=True, text=True, timeout=60).stdout
    for line in out.splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1]
    raise RuntimeError("no DATABASE_URL from railway")


def fetch_counts(url):
    import psycopg2
    with psycopg2.connect(url, connect_timeout=20,
                          options="-c default_transaction_read_only=on -c statement_timeout=120000") as conn:
        with conn.cursor() as cur:
            cur.execute(COUNT_SQL)
            total, remaining, in_bucket, ignored = cur.fetchone()
    conn.close()
    return {"total": total, "remaining": remaining, "in_bucket": in_bucket, "ignored": ignored}


def analysed(counts):
    """Previews analysed so far: ignored ones are neither left nor analysed."""
    return counts["total"] - counts["remaining"] - counts.get("ignored", 0)


def rate_per_hour(samples, now):
    """Analysed previews per hour from `[time, analysed]` samples (oldest
    first), or None until a sample is MIN_RATE_SPAN_S old."""
    if not samples:
        return None
    t_now, analysed_now = samples[-1]
    older = [s for s in samples if t_now - s[0] >= RATE_WINDOW_S]
    base = older[-1] if older else samples[0]
    span = t_now - base[0]
    if span < MIN_RATE_SPAN_S:
        return None
    return (analysed_now - base[1]) * 3600 / span


def format_duration(hours):
    if hours >= 24:
        days, hrs = divmod(int(round(hours)), 24)
        return f"{days}d {hrs}h"
    hrs, minutes = divmod(int(round(hours * 60)), 60)
    if hrs:
        return f"{hrs}h {minutes:02d}m"
    return f"{minutes}m"


PARTS = ["counts", "rate"]


def status_parts(counts, rate):
    """`[counts, rate]` texts: short enough for two lines of a phone-width
    tmux client, joined with " · " on a wide one."""
    left = f"bucket {counts['in_bucket']} · left {counts['remaining']}/{counts['total']}"
    if counts.get("ignored"):
        left += f" · ignored {counts['ignored']}"
    if counts['remaining'] == 0:
        return [left, "done"]
    if rate is None:
        return [left, "…/h · ETA …"]
    if rate <= 0:
        return [left, "0/h · ETA –"]
    return [left, f"{rate:.0f}/h · ETA {format_duration(counts['remaining'] / rate)}"]


def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save(path, state):
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, path)


def progress(cache_path, refresh_s, now=None, fetch=None):
    """Return the status parts (see status_parts), refreshing the cache when
    it is older than refresh_s. Never raises: tmux shows whatever is printed."""
    now = time.time() if now is None else now
    state = load(cache_path)
    if state.get("parts") and now - state.get("fetched_at", 0) < refresh_s:
        return state["parts"]
    with open(f"{cache_path}.lock", "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            # Another run is refreshing: show what we have.
            return state.get("parts") or ["progress: counting…"]
        try:
            counts = (fetch or (lambda: fetch_counts(database_url())))()
        except Exception as e:  # noqa: BLE001
            if state.get("parts"):
                return state["parts"][:-1] + [f"{state['parts'][-1]} (stale)"]
            return [f"progress: {str(e).splitlines()[0][:60] if str(e) else type(e).__name__}"]
        samples = [s for s in state.get("samples", []) if now - s[0] <= HISTORY_S]
        samples.append([now, analysed(counts)])
        parts = status_parts(counts, rate_per_hour(samples, now))
        save(cache_path, {"fetched_at": now, "counts": counts, "samples": samples, "parts": parts})
        return parts


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--cache", default=os.getenv("ANALYSIS_PROGRESS_CACHE", default_cache_path()),
                    help="Cache file (default: %(default)s)")
    ap.add_argument("--refresh", type=float, default=300,
                    help="Ask the database at most this often, in seconds (default: %(default)s)")
    ap.add_argument("--part", choices=PARTS,
                    help="Print only the counts or only the rate and estimate (default: both on one line)")
    args = ap.parse_args(argv)
    parts = progress(args.cache, args.refresh)
    if args.part:
        index = PARTS.index(args.part)
        print(parts[index] if index < len(parts) else "")
    else:
        print(" · ".join(parts))
    return 0


if __name__ == "__main__":
    sys.exit(main())
