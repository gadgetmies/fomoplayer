"""Tests for resolving backend-relative storage URLs (`/api/storage/...`)."""

from auth import resolve_url


def test_api_path_resolves_against_api_origin(monkeypatch):
    monkeypatch.setenv("FOMOPLAYER_API_URL", "https://app.example.test/api")
    assert resolve_url("/api/storage/notification-samples/1/a.mp3") == (
        "https://app.example.test/api/storage/notification-samples/1/a.mp3"
    )


def test_absolute_url_is_unchanged(monkeypatch):
    monkeypatch.delenv("FOMOPLAYER_API_URL", raising=False)
    url = "https://example.bandcamp.com/stream/track.mp3"
    assert resolve_url(url) == url


def test_missing_url_is_unchanged():
    assert resolve_url(None) is None
    assert resolve_url("") == ""
