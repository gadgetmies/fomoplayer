UPDATE bandcamp_mislabeled_artist SET bandcamp_mislabeled_artist_url = '' WHERE bandcamp_mislabeled_artist_url IS NULL;
UPDATE bandcamp_mislabeled_label SET bandcamp_mislabeled_label_url = '' WHERE bandcamp_mislabeled_label_url IS NULL;
ALTER TABLE bandcamp_mislabeled_artist ALTER COLUMN bandcamp_mislabeled_artist_url SET NOT NULL;
ALTER TABLE bandcamp_mislabeled_label ALTER COLUMN bandcamp_mislabeled_label_url SET NOT NULL;
