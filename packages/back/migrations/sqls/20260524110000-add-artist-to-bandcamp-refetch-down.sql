ALTER TABLE bandcamp_label_artist_refetch DROP CONSTRAINT IF EXISTS bandcamp_label_artist_refetch_one_entity;
DELETE FROM bandcamp_label_artist_refetch WHERE label_id IS NULL;
ALTER TABLE bandcamp_label_artist_refetch DROP COLUMN IF EXISTS artist_id;
ALTER TABLE bandcamp_label_artist_refetch ALTER COLUMN label_id SET NOT NULL;
