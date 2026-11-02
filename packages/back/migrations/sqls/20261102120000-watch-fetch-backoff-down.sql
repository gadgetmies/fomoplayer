ALTER TABLE store__artist
  DROP COLUMN store__artist_fetch_failure_count,
  DROP COLUMN store__artist_fetch_retry_after;

ALTER TABLE store__label
  DROP COLUMN store__label_fetch_failure_count,
  DROP COLUMN store__label_fetch_retry_after;

ALTER TABLE playlist
  DROP COLUMN playlist_fetch_failure_count,
  DROP COLUMN playlist_fetch_retry_after;
