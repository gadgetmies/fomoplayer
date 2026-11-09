-- Per-entity retry backoff for the watch fetch jobs.
--
-- A followed artist, label or playlist whose fetch fails (for a reason other
-- than a store-wide rate limit) used to keep its old last_update and so came
-- first in the very next batch, every run, however often it kept failing.
-- The failure count and retry time let the jobs wait before retrying it,
-- doubling the wait on each further failure; a successful fetch resets both.
ALTER TABLE store__artist
  ADD COLUMN store__artist_fetch_failure_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN store__artist_fetch_retry_after TIMESTAMPTZ;

ALTER TABLE store__label
  ADD COLUMN store__label_fetch_failure_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN store__label_fetch_retry_after TIMESTAMPTZ;

ALTER TABLE playlist
  ADD COLUMN playlist_fetch_failure_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN playlist_fetch_retry_after TIMESTAMPTZ;
