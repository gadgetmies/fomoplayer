-- The Bandcamp stream URL of a preview. Bandcamp's mobile endpoint returns
-- bandcamp.com/stream_redirect URLs signed for one track; they stay usable for
-- days (one issued 13 days earlier still worked on 2026-11-15), so playback and
-- the prefetchPreviewAudio job use the stored URL instead of looking the
-- release up. A URL older than BANDCAMP_STREAM_URL_REFRESH_AGE_DAYS, or one that
-- fails, is replaced by looking the release up, which updates every track of
-- the release.
CREATE TABLE store__track_preview_stream
(
  store__track_preview_id                BIGINT PRIMARY KEY NOT NULL
    REFERENCES store__track_preview (store__track_preview_id) ON DELETE CASCADE,
  store__track_preview_stream_url        TEXT        NOT NULL,
  store__track_preview_stream_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
