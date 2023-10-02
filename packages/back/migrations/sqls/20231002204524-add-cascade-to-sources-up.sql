ALTER TABLE track
    DROP CONSTRAINT track_source_id_fkey;
ALTER TABLE track
    ADD CONSTRAINT track_source_id_fkey FOREIGN KEY (track_source) REFERENCES source (source_id) ON DELETE SET NULL;

ALTER TABLE artist
    DROP CONSTRAINT artist_source_id_fkey;
ALTER TABLE artist
    ADD CONSTRAINT artist_source_id_fkey FOREIGN KEY (artist_source) REFERENCES source (source_id) ON DELETE SET NULL;

ALTER TABLE release
    DROP CONSTRAINT release_source_id_fkey;
ALTER TABLE release
    ADD CONSTRAINT release_source_id_fkey FOREIGN KEY (release_source) REFERENCES source (source_id) ON DELETE SET NULL;

ALTER TABLE store__label
    DROP CONSTRAINT store__label_source_id_fkey;
ALTER TABLE store__label
    ADD CONSTRAINT store__label_source_id_fkey FOREIGN KEY (store__label_source) REFERENCES source (source_id) ON DELETE SET NULL;

ALTER TABLE store__artist
    DROP CONSTRAINT store__artist_source_id_fkey;
ALTER TABLE store__artist
    ADD CONSTRAINT store__artist_source_id_fkey FOREIGN KEY (store__artist_source) REFERENCES source (source_id) ON DELETE SET NULL;

ALTER TABLE store__release
    DROP CONSTRAINT store__release_source_id_fkey;
ALTER TABLE store__release
    ADD CONSTRAINT store__release_source_id_fkey FOREIGN KEY (store__release_source) REFERENCES source (source_id) ON DELETE SET NULL;

ALTER TABLE store__track
    DROP CONSTRAINT store__track_source_id_fkey;
ALTER TABLE store__track
    ADD CONSTRAINT store__track_source_id_fkey FOREIGN KEY (store__track_source) REFERENCES source (source_id) ON DELETE SET NULL;

ALTER TABLE store__track_preview
    DROP CONSTRAINT store__track_preview_source_id_fkey;
ALTER TABLE store__track_preview
    ADD CONSTRAINT store__track_preview_source_id_fkey FOREIGN KEY (store__track_preview_source) REFERENCES source (source_id) ON DELETE SET NULL;

ALTER TABLE store__track_preview_waveform
    DROP CONSTRAINT store__track_preview_waveform_source_id_fkey;
ALTER TABLE store__track_preview_waveform
    ADD CONSTRAINT store__track_preview_waveform_source_id_fkey FOREIGN KEY (store__track_preview_waveform_source) REFERENCES source (source_id) ON DELETE SET NULL;

ALTER TABLE track__key
    DROP CONSTRAINT track__key_source_id_fkey;
ALTER TABLE track__key
    ADD CONSTRAINT track__key_source_id_fkey FOREIGN KEY (track__key_source) REFERENCES source (source_id) ON DELETE SET NULL;

ALTER TABLE user__track
    DROP CONSTRAINT user__track_source_id_fkey;
ALTER TABLE user__track
    ADD CONSTRAINT user__track_source_id_fkey FOREIGN KEY (user__track_source) REFERENCES source (source_id) ON DELETE SET NULL;
