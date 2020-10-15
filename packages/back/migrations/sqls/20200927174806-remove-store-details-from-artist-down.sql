ALTER TABLE store__artist ADD COLUMN store__artist_store_details JSONB NOT NULL DEFAULT '{}'::JSONB;
