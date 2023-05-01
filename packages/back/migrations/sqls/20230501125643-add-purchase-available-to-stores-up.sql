ALTER TABLE store ADD COLUMN store_purchase_available BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE store SET store_purchase_available = TRUE WHERE store_name <> 'Spotify';
