ALTER TABLE store__label ADD COLUMN store__label_url TEXT;

UPDATE store__label SET store__label_url = 'https://www.beatport.com/label/' || (store__label_store_details->>'slug') || '/' || (store__label_store_details->>'id') where store__label_id in (select store__label_id from store__label natural join store where store_name = 'beatport');
