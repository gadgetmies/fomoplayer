ALTER TABLE store__label
    ADD CONSTRAINT store__label_store__label_store_id_store_id_key UNIQUE (store__label_store_id, store_id);

ALTER TABLE store__label DROP CONSTRAINT store__label_store__label_store_id_key;
