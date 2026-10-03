"""Resolve Bandcamp stream URLs for previews the backend has no URL for.

Bandcamp stream URLs expire, so the backend doesn't store them; the player
looks them up on demand. The analyser does the lookup itself from the release
page instead of calling the backend's /stores/bandcamp/previews route: a burst
of lookups there could get the production server rate-limited by Bandcamp,
which suspends Bandcamp playback for every user for ten minutes.

Bandcamp "previews" are full tracks, so the resolved URL is the whole track.
"""
import html
import json
import re
import time

import requests

MIN_INTERVAL_S = 2.0
RATE_LIMIT_PAUSE_S = 600

_TRALBUM_RE = re.compile(r'data-tralbum="([^"]*)"')
_last_request = 0.0
_release_cache = {}


class RateLimited(Exception):
    pass


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
        raise RateLimited(f"Bandcamp returned {res.status_code} for {release_url}")
    if res.status_code in (404, 410):
        info = None
    else:
        res.raise_for_status()
        info = parse_release_info(res.text)

    _release_cache[release_url] = info
    return info


def resolve_stream_url(release_url, store_track_id):
    """Return the track's stream URL, or None when Bandcamp doesn't stream it.

    Raises RateLimited when Bandcamp throttles us, and requests exceptions on
    other transient failures; callers should retry those later rather than
    marking the preview missing.
    """
    if not release_url or not store_track_id:
        return None
    return find_stream_url(_get_release_info(release_url), store_track_id)
