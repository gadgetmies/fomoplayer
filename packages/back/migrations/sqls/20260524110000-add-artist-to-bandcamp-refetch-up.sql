-- Allow the Bandcamp re-attribution queue to also hold artists (to fix tracks
-- mis-attributed by the title-prefix heuristic on an artist page), not just
-- labels converted from mislabeled artists. Exactly one of label_id / artist_id
-- is set per row.
ALTER TABLE bandcamp_label_artist_refetch ALTER COLUMN label_id DROP NOT NULL;

ALTER TABLE bandcamp_label_artist_refetch
  ADD COLUMN artist_id INTEGER UNIQUE REFERENCES artist (artist_id) ON DELETE CASCADE;

ALTER TABLE bandcamp_label_artist_refetch
  ADD CONSTRAINT bandcamp_label_artist_refetch_one_entity
  CHECK ((label_id IS NOT NULL) <> (artist_id IS NOT NULL));
