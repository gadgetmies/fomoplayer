-- Manually flagged entities (admin UI) may not have a Bandcamp store URL, so
-- the cached URL is no longer required. Page-detected rows still set it.
ALTER TABLE bandcamp_mislabeled_artist ALTER COLUMN bandcamp_mislabeled_artist_url DROP NOT NULL;
ALTER TABLE bandcamp_mislabeled_label ALTER COLUMN bandcamp_mislabeled_label_url DROP NOT NULL;
