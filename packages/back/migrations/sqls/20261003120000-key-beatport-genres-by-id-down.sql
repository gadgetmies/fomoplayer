-- Restoring the per-store name uniqueness means dropping the extra rows of any
-- name that now occurs more than once (keeping the oldest). Tracks link to
-- genre, not store__genre, so no track loses a genre.
WITH duplicates AS (SELECT store__genre_id
                         , FIRST_VALUE(store__genre_id)
                           OVER (PARTITION BY store_id, store__genre_name ORDER BY store__genre_id) AS kept_id
                    FROM store__genre)
UPDATE store__genre child
SET store__genre_parent_id = duplicates.kept_id
FROM duplicates
WHERE child.store__genre_parent_id = duplicates.store__genre_id
  AND duplicates.store__genre_id <> duplicates.kept_id;

DELETE
FROM store__genre sg
WHERE EXISTS (SELECT 1
              FROM store__genre older
              WHERE older.store_id = sg.store_id
                AND older.store__genre_name = sg.store__genre_name
                AND older.store__genre_id < sg.store__genre_id);

ALTER TABLE store__genre
  DROP CONSTRAINT IF EXISTS store__genre_store_id_store__genre_name_key,
  ADD CONSTRAINT store__genre_store_id_store__genre_name_key UNIQUE (store_id, store__genre_name);

-- Slugs are not stored, so approximate them from the genre name the way
-- Beatport builds them ("Drum & Bass" -> drum-bass). Where several rows would
-- still get the same slug, only the lowest id is reverted and the rest keep
-- their id key.
WITH slugged AS (SELECT store__genre_id
                      , trim(BOTH '-' FROM regexp_replace(lower(store__genre_name), '[^a-z0-9]+', '-', 'g')) AS slug
                 FROM store__genre
                 WHERE store_id = (SELECT store_id FROM store WHERE store_name = 'Beatport')
                   AND store__genre_store_id ~ '^(sub-)?genres/[0-9]+$')
   , reverted AS (SELECT DISTINCT ON (slug) store__genre_id, slug
                  FROM slugged
                  ORDER BY slug, store__genre_id)
UPDATE store__genre sg
SET store__genre_store_id = reverted.slug
FROM reverted
WHERE sg.store__genre_id = reverted.store__genre_id;
