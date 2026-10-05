-- Beatport store genres were keyed by slug, which is neither unique (the genre
-- and the sub-genre "Pop" share `pop`, three "Dub" sub-genres share `dub`) nor
-- stable (renames change it). Key them by Beatport's numeric id instead,
-- namespaced as `genres/{id}` / `sub-genres/{id}` because genre and sub-genre
-- ids are separate sequences. The id is taken from the stored v4 API URL, which
-- ends in exactly that path. Only slug-keyed rows match, so it is idempotent.
-- A genre Beatport renamed was stored twice under its old and new slug, so both
-- rows resolve to the same id ("DJ Tools" / "DJ Tools / Acapellas" are both
-- genres/16). Merge each such group into its newest row, which carries the
-- current name, before re-keying: move children, track and artist links over to
-- it and drop the rest. Groups of one are left alone, so this is idempotent.
CREATE TEMPORARY TABLE beatport_genre_merge AS
WITH keyed AS (SELECT store__genre_id
                    , genre_id
                    , CASE
                        WHEN store__genre_store_id ~ '^(sub-)?genres/[0-9]+$' THEN store__genre_store_id
                        ELSE substring(store__genre_url FROM '/((?:sub-)?genres/[0-9]+)/?$')
                      END AS beatport_id
               FROM store__genre
               WHERE store_id = (SELECT store_id FROM store WHERE store_name = 'Beatport'))
   , ranked AS (SELECT keyed.*
                     , FIRST_VALUE(store__genre_id) OVER (PARTITION BY beatport_id ORDER BY store__genre_id DESC) AS kept_id
                     , FIRST_VALUE(genre_id) OVER (PARTITION BY beatport_id ORDER BY store__genre_id DESC) AS kept_genre_id
                FROM keyed
                WHERE beatport_id IS NOT NULL)
SELECT store__genre_id, genre_id, kept_id, kept_genre_id
FROM ranked
WHERE store__genre_id <> kept_id;

UPDATE store__genre
SET store__genre_parent_id = m.kept_id
FROM beatport_genre_merge m
WHERE store__genre_parent_id = m.store__genre_id;

DELETE
FROM track__genre tg
USING beatport_genre_merge m
WHERE tg.genre_id = m.genre_id
  AND m.genre_id <> m.kept_genre_id
  AND EXISTS (SELECT 1 FROM track__genre kept WHERE kept.track_id = tg.track_id AND kept.genre_id = m.kept_genre_id);

UPDATE track__genre
SET genre_id = m.kept_genre_id
FROM beatport_genre_merge m
WHERE track__genre.genre_id = m.genre_id
  AND m.genre_id <> m.kept_genre_id;

DELETE
FROM artist__genre ag
USING beatport_genre_merge m
WHERE ag.genre_id = m.genre_id
  AND m.genre_id <> m.kept_genre_id
  AND EXISTS (SELECT 1 FROM artist__genre kept WHERE kept.artist_id = ag.artist_id AND kept.genre_id = m.kept_genre_id);

UPDATE artist__genre
SET genre_id = m.kept_genre_id
FROM beatport_genre_merge m
WHERE artist__genre.genre_id = m.genre_id
  AND m.genre_id <> m.kept_genre_id;

DELETE
FROM store__genre
WHERE store__genre_id IN (SELECT store__genre_id FROM beatport_genre_merge);

-- The merged-away genres are dropped once nothing else (another store's genre
-- or a sub-genre) still refers to them.
UPDATE genre
SET genre_parent = m.kept_genre_id
FROM beatport_genre_merge m
WHERE genre.genre_parent = m.genre_id
  AND m.genre_id <> m.kept_genre_id;

DELETE
FROM genre g
USING beatport_genre_merge m
WHERE g.genre_id = m.genre_id
  AND m.genre_id <> m.kept_genre_id
  AND NOT EXISTS (SELECT 1 FROM store__genre sg WHERE sg.genre_id = g.genre_id);

DROP TABLE beatport_genre_merge;

UPDATE store__genre
SET store__genre_store_id = substring(store__genre_url FROM '/((?:sub-)?genres/[0-9]+)/?$')
WHERE store_id = (SELECT store_id FROM store WHERE store_name = 'Beatport')
  AND store__genre_url ~ '/(sub-)?genres/[0-9]+/?$'
  AND store__genre_store_id !~ '^(sub-)?genres/[0-9]+$';

-- Names are not unique within a store either (the same "Pop" and "Dub" cases),
-- so once the colliding genres stop sharing a slug they also need to be able to
-- share a name. The store id is the identity; the name is just a label.
ALTER TABLE store__genre
  DROP CONSTRAINT IF EXISTS store__genre_store_id_store__genre_name_key;
