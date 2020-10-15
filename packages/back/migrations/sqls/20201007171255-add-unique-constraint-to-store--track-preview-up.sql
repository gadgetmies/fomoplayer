ALTER TABLE store__track_preview
    ADD CONSTRAINT store__track_preview_store__track_id_preview_url_key UNIQUE (store__track_id, store__track_preview_url);
