ALTER TABLE store__artist
    ADD CONSTRAINT store__artist_store__artist_store_id_store_id_key UNIQUE (store__artist_store_id, store_id);
