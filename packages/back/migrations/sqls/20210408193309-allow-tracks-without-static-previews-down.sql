DELETE FROM store__track_preview WHERE store__track_preview_url IS NULL;
ALTER TABLE store__track_preview ALTER COLUMN store__track_preview_url SET NOT NULL;
