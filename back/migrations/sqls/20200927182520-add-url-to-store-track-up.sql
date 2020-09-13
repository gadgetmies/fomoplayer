ALTER TABLE store__track ADD COLUMN store__track_url TEXT;

UPDATE store__track SET store__track_url = 'https://www.beatport.com/track/' || (store__track_store_details->>'slug') || '/' || (store__track_store_details->>'id') where store__track_id in (select store__track_id from store__track natural join store where store_name = 'beatport');
