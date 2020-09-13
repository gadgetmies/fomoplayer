ALTER TABLE store__artist ADD COLUMN store__artist_url TEXT;

UPDATE store__artist SET store__artist_url = 'https://www.beatport.com/artist/' || (store__artist_store_details->>'slug') || '/' || (store__artist_store_details->>'id') where store__artist_id in (select store__artist_id from store__artist natural join store where store_name = 'beatport');
