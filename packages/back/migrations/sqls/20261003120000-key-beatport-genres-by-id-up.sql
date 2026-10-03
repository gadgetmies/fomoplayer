-- Beatport store genres were keyed by slug, which is neither unique (the genre
-- and the sub-genre "Pop" share `pop`, three "Dub" sub-genres share `dub`) nor
-- stable (renames change it). Key them by Beatport's numeric id instead,
-- namespaced as `genres/{id}` / `sub-genres/{id}` because genre and sub-genre
-- ids are separate sequences. The id is taken from the stored v4 API URL, which
-- ends in exactly that path. Only slug-keyed rows match, so it is idempotent.
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
