"""Resolve Bandcamp stream URLs for previews the backend has no URL for.

Bandcamp stream URLs expire, so the backend doesn't store them; the player
looks them up on demand. The analyser does the lookup itself from the release
page instead of calling the backend's /stores/bandcamp/previews route: a burst
of lookups there could get the production server rate-limited by Bandcamp,
which suspends Bandcamp playback for every user for ten minutes.

Bandcamp "previews" are full tracks, so the resolved URL is the whole track.

The stream URLs of every release looked up are kept in a file shared by the
workers and across runs (see "Stream URL cache" below), so a release is only
looked up again once its URLs expire.
"""
import html
import json
import os
import re
import tempfile
import time
from urllib.parse import parse_qs, urlparse

import requests

MIN_INTERVAL_S = 2.0
RATE_LIMIT_PAUSE_S = 600

# Stream URL cache. A stream URL is signed for one track, so no token can be
# reused across tracks, but a URL stays usable until it expires. Release pages
# give CDN URLs (*.bcbits.com/stream/...) whose `ts` parameter is their expiry
# time, 24 h after they are issued (measured 2026-11-15). The mobile API gives
# bandcamp.com/stream_redirect URLs whose `ts` is the time they were issued;
# one issued 13 days earlier still worked, so they are used for
# BANDCAMP_STREAM_URL_REFRESH_AGE_DAYS (13 by default), as in the backend. A cached URL is used until
# EXPIRY_MARGIN_S before it expires, and a refused one is forgotten
# (forget_stream_url) so the next resolve looks the release up again.
STREAM_CACHE_PATH = os.getenv(
    "BANDCAMP_STREAM_CACHE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "bandcamp_stream_urls.json"),
)
REDIRECT_URL_MAX_AGE_S = float(os.getenv("BANDCAMP_STREAM_URL_REFRESH_AGE_DAYS", "13")) * 24 * 3600
UNKNOWN_URL_MAX_AGE_S = 3600
EXPIRY_MARGIN_S = 15 * 60

_TRALBUM_RE = re.compile(r'data-tralbum="([^"]*)"')
_last_request = 0.0
_release_cache = {}


class RateLimited(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def parse_release_info(page_source):
    """Return the release's data-tralbum JSON, or None if the page has none."""
    match = _TRALBUM_RE.search(page_source)
    return json.loads(html.unescape(match.group(1))) if match else None


def find_stream_url(release_info, store_track_id):
    """Return the mp3-128 stream URL for the track, or None if it has none."""
    for track in (release_info or {}).get("trackinfo") or []:
        if str(track.get("track_id")) == str(store_track_id):
            return (track.get("file") or {}).get("mp3-128")
    return None


def stream_url_expiry(url, fetched_at):
    """Return the time (epoch seconds) after which a stream URL fetched at
    fetched_at must not be used."""
    parsed = urlparse(url)
    ts = parse_qs(parsed.query).get("ts", [None])[0]
    if parsed.hostname and parsed.hostname.endswith("bcbits.com") and ts and ts.isdigit():
        return int(ts)
    if parsed.path.endswith("/stream_redirect"):
        return fetched_at + REDIRECT_URL_MAX_AGE_S
    return fetched_at + UNKNOWN_URL_MAX_AGE_S


def _load_stream_cache():
    try:
        with open(STREAM_CACHE_PATH) as f:
            cache = json.load(f)
        return cache if isinstance(cache, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_stream_cache(update, remove=()):
    """Merge update into the cache file and drop removed and expired entries.
    The file is re-read first and replaced atomically, because the workers
    share it; a lost race only costs a lookup."""
    now = time.time()
    cache = _load_stream_cache()
    cache.update(update)
    for track_id in remove:
        cache.pop(str(track_id), None)
    cache = {
        track_id: entry for track_id, entry in cache.items()
        if isinstance(entry, dict) and entry.get("url")
        and stream_url_expiry(entry["url"], entry.get("fetched_at", 0)) > now
    }
    directory = os.path.dirname(STREAM_CACHE_PATH) or "."
    try:
        fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".bandcamp_stream_urls.")
        with os.fdopen(fd, "w") as f:
            json.dump(cache, f)
        os.replace(tmp_path, STREAM_CACHE_PATH)
    except OSError as e:
        print(f"Could not save the Bandcamp stream URL cache: {e}")


def cached_stream_url(store_track_id, now=None):
    """Return the cached stream URL of the track while it is safe to use."""
    now = time.time() if now is None else now
    entry = _load_stream_cache().get(str(store_track_id))
    if not entry or not entry.get("url"):
        return None
    if stream_url_expiry(entry["url"], entry.get("fetched_at", 0)) - EXPIRY_MARGIN_S <= now:
        return None
    return entry["url"]


def remember_stream_urls(release_info):
    """Cache the stream URLs of every track of a release."""
    now = time.time()
    update = {}
    for track in (release_info or {}).get("trackinfo") or []:
        url = (track.get("file") or {}).get("mp3-128")
        if url and track.get("track_id"):
            update[str(track.get("track_id"))] = {"url": url, "fetched_at": now}
    if update:
        _save_stream_cache(update)


def forget_stream_url(store_track_id):
    """Drop a refused stream URL so the next resolve looks the release up."""
    _save_stream_cache({}, remove=[store_track_id])


def _get_release_info(release_url):
    global _last_request
    if release_url in _release_cache:
        return _release_cache[release_url]

    wait = MIN_INTERVAL_S - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    _last_request = time.monotonic()

    res = requests.get(release_url, timeout=30)
    if res.status_code in (403, 429):
        raise RateLimited(f"Bandcamp returned {res.status_code} for {release_url}", res.status_code)
    if res.status_code in (404, 410):
        info = None
    else:
        res.raise_for_status()
        info = parse_release_info(res.text)

    _release_cache[release_url] = info
    remember_stream_urls(info)
    return info


def resolve_stream_url(release_url, store_track_id):
    """Return the track's stream URL, or None when Bandcamp doesn't stream it.

    Raises RateLimited when Bandcamp throttles us, and requests exceptions on
    other transient failures; callers should retry those later rather than
    marking the preview missing.
    """
    if not release_url or not store_track_id:
        return None
    cached = cached_stream_url(store_track_id)
    if cached:
        return cached
    return find_stream_url(_get_release_info(release_url), store_track_id)
