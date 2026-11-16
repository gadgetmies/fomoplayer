ALTER TABLE store__track_preview
  DROP COLUMN IF EXISTS store__track_preview_url_ephemeral,
  DROP COLUMN IF EXISTS store__track_preview_url_ephemeral_fetched_at;
