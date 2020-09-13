ALTER TABLE store ADD COLUMN store_url TEXT;

UPDATE store SET store_url = 'https://www.beatport.com' WHERE store_name = 'Beatport';
UPDATE store SET store_url = 'https://bandcamp.com' WHERE store_name = 'Bandcamp';

ALTER TABLE store ALTER COLUMN store_url SET NOT NULL;
