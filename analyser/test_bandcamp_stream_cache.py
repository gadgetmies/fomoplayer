"""Tests for bandcamp.py's stream URL cache.

Release lookups are rate limited, so the stream URLs of every release looked
up are kept in a file shared by the workers and across runs, and used until
they expire. No network is needed: the release page request is stubbed.

Run:

    cd analyser
    source venv/bin/activate
    python -m pytest test_bandcamp_stream_cache.py
"""

import html
import json
import os
import sys
import time

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bandcamp  # noqa: E402

RELEASE_URL = "https://artist.bandcamp.com/album/x"


def cdn_url(track_id, expires_at):
    return (f"https://t4.bcbits.com/stream/abc/mp3-128/{track_id}"
            f"?p=0&ts={int(expires_at)}&t=sig&token={int(expires_at)}_sig")


def redirect_url(track_id, issued_at):
    return f"https://bandcamp.com/stream_redirect?enc=mp3-128&track_id={track_id}&ts={int(issued_at)}&t=sig"


def release_page(streams):
    tralbum = {"trackinfo": [{"track_id": int(t), "file": {"mp3-128": u} if u else None} for t, u in streams.items()]}
    return f'<div data-tralbum="{html.escape(json.dumps(tralbum))}"></div>'


class FakePage:
    status_code = 200

    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        pass


@pytest.fixture(autouse=True)
def isolated_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(bandcamp, "STREAM_CACHE_PATH", str(tmp_path / "stream_urls.json"))
    monkeypatch.setattr(bandcamp, "MIN_INTERVAL_S", 0)
    bandcamp._release_cache.clear()
    yield
    bandcamp._release_cache.clear()


@pytest.fixture
def page_requests(monkeypatch):
    requests_made = []

    def serve(streams):
        def fake_get(url, **_kwargs):
            requests_made.append(url)
            return FakePage(release_page(streams))
        monkeypatch.setattr(bandcamp.requests, "get", fake_get)

    return requests_made, serve


def test_cdn_urls_expire_at_their_ts():
    assert bandcamp.stream_url_expiry(cdn_url(1, 2_000_000_000), fetched_at=0) == 2_000_000_000


def test_redirect_urls_are_trusted_for_the_refresh_age():
    fetched = 1_800_000_000
    assert bandcamp.stream_url_expiry(redirect_url(1, fetched), fetched) == fetched + 13 * 24 * 3600


def test_a_resolved_release_serves_its_other_tracks_without_a_lookup(page_requests):
    requests_made, serve = page_requests
    expires = time.time() + 24 * 3600
    serve({"1": cdn_url(1, expires), "2": cdn_url(2, expires)})
    assert bandcamp.resolve_stream_url(RELEASE_URL, "1") == cdn_url(1, expires)

    bandcamp._release_cache.clear()  # a new run: only the file cache is left
    assert bandcamp.resolve_stream_url(RELEASE_URL, "2") == cdn_url(2, expires)
    assert len(requests_made) == 1


def test_a_url_close_to_expiry_is_looked_up_again(page_requests):
    requests_made, serve = page_requests
    serve({"1": cdn_url(1, time.time() + 60)})
    bandcamp.resolve_stream_url(RELEASE_URL, "1")
    bandcamp._release_cache.clear()

    assert bandcamp.cached_stream_url("1") is None
    bandcamp.resolve_stream_url(RELEASE_URL, "1")
    assert len(requests_made) == 2


def test_a_forgotten_url_is_looked_up_again(page_requests):
    requests_made, serve = page_requests
    serve({"1": cdn_url(1, time.time() + 24 * 3600)})
    bandcamp.resolve_stream_url(RELEASE_URL, "1")
    bandcamp.forget_stream_url("1")
    bandcamp._release_cache.clear()

    assert bandcamp.cached_stream_url("1") is None
    bandcamp.resolve_stream_url(RELEASE_URL, "1")
    assert len(requests_made) == 2


def test_tracks_without_a_stream_are_not_cached(page_requests):
    _requests_made, serve = page_requests
    serve({"1": None})
    assert bandcamp.resolve_stream_url(RELEASE_URL, "1") is None
    assert bandcamp.cached_stream_url("1") is None


def test_expired_entries_are_dropped_from_the_file():
    now = time.time()
    bandcamp._save_stream_cache({
        "1": {"url": cdn_url(1, now - 10), "fetched_at": now - 3600},
        "2": {"url": cdn_url(2, now + 3600), "fetched_at": now},
    })
    with open(bandcamp.STREAM_CACHE_PATH) as f:
        assert list(json.load(f)) == ["2"]


def test_a_broken_cache_file_is_ignored():
    with open(bandcamp.STREAM_CACHE_PATH, "w") as f:
        f.write("not json")
    assert bandcamp.cached_stream_url("1") is None
