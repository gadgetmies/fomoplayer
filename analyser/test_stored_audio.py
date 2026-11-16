"""Tests for reading preview audio from the bucket.

The backend's prefetchPreviewAudio job stores preview audio in the bucket and
the queue endpoints serve it as `audio_url` (`/api/storage/<key>`). The
workers ask for those previews only (`audio=stored`) and download them from
the bucket without contacting a store. No network, Panako or DB is needed.

Run:

    cd analyser
    source venv/bin/activate
    python -m pytest test_stored_audio.py
"""

import os
import sys
import types

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import auth  # noqa: E402
import panako_processor as pp  # noqa: E402

API_URL = "https://api.example.test/api"


@pytest.fixture(autouse=True)
def api_url(monkeypatch):
    monkeypatch.setenv("FOMOPLAYER_API_URL", API_URL)
    monkeypatch.setenv("FOMOPLAYER_API_KEY", "test-key")


class FakeResponse:
    status_code = 200

    def __init__(self, payload):
        self.payload = payload
        self.text = ""

    def json(self):
        return self.payload

    def raise_for_status(self):
        pass


def record_gets(monkeypatch, module, payload):
    urls = []

    def fake_get(url, **_kwargs):
        urls.append(url)
        return FakeResponse(payload)

    monkeypatch.setattr(module.requests, "get", fake_get)
    return urls


def test_queues_are_limited_to_stored_audio_unless_downloading_directly():
    assert auth.stored_audio_query(False) == "&audio=stored"
    assert auth.stored_audio_query(True) == ""


def test_fingerprint_queue_asks_for_stored_audio(monkeypatch):
    urls = record_gets(monkeypatch, pp, [])
    pp.get_next_previews_to_fingerprint(batch_size=5)
    pp.get_next_previews_to_fingerprint(batch_size=5, direct_download=True)
    assert urls[0].endswith("without-fingerprint?limit=5&audio=stored")
    assert urls[1].endswith("without-fingerprint?limit=5")


def test_stored_audio_resolves_against_the_api():
    stored = pp.resolve_stored_audio({"preview_id": 7, "audio_url": "/api/storage/preview-audio/a.mp3"})
    assert stored["url"] == "https://api.example.test/api/storage/preview-audio/a.mp3"
    assert stored["filename"] == "7.mp3"
    assert pp.resolve_stored_audio({"preview_id": 7, "audio_url": None}) is None


class StopBeforeFingerprinting(Exception):
    pass


def test_fingerprinting_stored_bandcamp_audio_makes_no_bandcamp_lookup(monkeypatch):
    monkeypatch.setattr(pp, "load_zero_fp_skiplist", lambda: set())
    monkeypatch.setattr(pp, "get_next_previews_to_fingerprint", lambda **_kwargs: [{
        "preview_id": 7,
        "url": None,
        "store_track_id": "123",
        "release_url": "https://artist.bandcamp.com/album/x",
        "audio_url": "/api/storage/preview-audio/a.mp3",
    }])

    def no_lookup(_preview):
        raise AssertionError("Bandcamp must not be contacted for stored audio")

    monkeypatch.setattr(pp, "resolve_bandcamp_url", no_lookup)
    jobs = []

    def capture(items, _n):
        jobs.extend(items)
        raise StopBeforeFingerprinting()

    monkeypatch.setattr(pp, "_split_into_chunks", capture)
    with pytest.raises(StopBeforeFingerprinting):
        pp.process_previews(batch_size=5, workers=1, score_after=0)
    assert jobs == [{
        "id": 7,
        "url": "https://api.example.test/api/storage/preview-audio/a.mp3",
        "filename": "7.mp3",
    }]


@pytest.fixture
def waveform(monkeypatch):
    """waveform.py connects to its bucket on import: stand a fake client in."""
    fake_minio = types.ModuleType("minio")

    class FakeMinio:
        def __init__(self, *_args, **_kwargs):
            pass

        def bucket_exists(self, _bucket):
            return True

    fake_minio.Minio = FakeMinio
    monkeypatch.setitem(sys.modules, "minio", fake_minio)
    monkeypatch.delitem(sys.modules, "waveform", raising=False)
    import waveform as module
    return module


def test_waveform_queue_asks_for_stored_audio(monkeypatch, waveform):
    urls = record_gets(monkeypatch, waveform, [])
    waveform.get_next_waveform_previews(5)
    waveform.get_next_waveform_previews(5, direct_download=True)
    assert urls[0].endswith("/admin/preview?limit=5&stores=Bandcamp&audio=stored")
    assert urls[1].endswith("/admin/preview?limit=5&stores=Bandcamp")


def test_waveform_downloads_stored_audio_without_contacting_bandcamp(monkeypatch, waveform):
    downloads = []
    monkeypatch.setattr(waveform, "download", lambda url, path: downloads.append((url, path)))

    def no_lookup(*_args):
        raise AssertionError("Bandcamp must not be contacted for stored audio")

    monkeypatch.setattr(waveform.bandcamp, "resolve_stream_url", no_lookup)
    preview = {
        "preview_id": 7,
        "store_name": "Bandcamp",
        "preview_url": None,
        "release_url": "https://artist.bandcamp.com/album/x",
        "store_track_id": "123",
        "audio_url": "/api/storage/preview-audio/a.mp3",
    }
    assert waveform.fetch_preview(preview, "/tmp/preview.mp3", waveform.Backoff()) is True
    assert downloads == [("https://api.example.test/api/storage/preview-audio/a.mp3", "/tmp/preview.mp3")]
