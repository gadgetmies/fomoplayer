ALTER TABLE store__track DROP CONSTRAINT store__track_store__track_store_id_store_id_key;
ALTER TABLE store__track ADD UNIQUE (store__track_store_id, store_id, track_id);
