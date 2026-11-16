-- A preview URL that works for a while but not for good: Bandcamp's mobile
-- endpoint returns bandcamp.com/stream_redirect URLs signed for one track, which
-- stay usable for days (one issued 13 days earlier still worked on 2026-11-15).
-- Playback and the prefetchPreviewAudio job use it instead of looking the
-- release up. Once it is older than BANDCAMP_STREAM_URL_REFRESH_AGE_DAYS, or
-- fails, the release is looked up again, which replaces the URLs of every track
-- of the release. store__track_preview_url stays for permanent URLs only.
ALTER TABLE store__track_preview
  ADD COLUMN IF NOT EXISTS store__track_preview_url_ephemeral TEXT,
  ADD COLUMN IF NOT EXISTS store__track_preview_url_ephemeral_fetched_at TIMESTAMPTZ;
