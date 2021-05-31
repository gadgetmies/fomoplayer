ALTER TABLE track__label
  DROP CONSTRAINT track__label_track_id_fkey;
ALTER TABLE track__label
  DROP CONSTRAINT track__label_label_id_fkey;

ALTER TABLE track__label
  ADD CONSTRAINT track__label_track_id_fkey FOREIGN KEY (track_id) REFERENCES track (track_id) ON DELETE CASCADE;
ALTER TABLE track__label
  ADD CONSTRAINT track__label_label_id_fkey FOREIGN KEY (label_id) REFERENCES label (label_id) ON DELETE CASCADE;

ALTER TABLE track__artist
  DROP CONSTRAINT track__artist_artist_id_fkey;
ALTER TABLE track__artist
  DROP CONSTRAINT track__artist_track_id_fkey;

ALTER TABLE track__artist
  ADD CONSTRAINT track__artist_track_id_fkey FOREIGN KEY (track_id) REFERENCES track (track_id) ON DELETE CASCADE;
ALTER TABLE track__artist
  ADD CONSTRAINT track__artist_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES artist (artist_id) ON DELETE CASCADE;

ALTER TABLE store__artist
  DROP CONSTRAINT store__artist_artist_id_fkey;
ALTER TABLE store__artist
  ADD CONSTRAINT store__artist_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES artist (artist_id) ON DELETE CASCADE;

ALTER TABLE store__artist_watch
  DROP CONSTRAINT store__artist_watch_store__artist_id_fkey;
ALTER TABLE store__artist_watch
  ADD CONSTRAINT store__artist_watch_store__artist_id_fkey FOREIGN KEY (store__artist_id) REFERENCES store__artist (store__artist_id) ON DELETE CASCADE;

ALTER TABLE store__artist_watch__user
  DROP CONSTRAINT store__artist_watch__user_store__artist_watch_id_fkey;
ALTER TABLE store__artist_watch__user
  ADD CONSTRAINT store__artist_watch__user_store__artist_watch_id_fkey FOREIGN KEY (store__artist_watch_id) REFERENCES store__artist_watch (store__artist_watch_id) ON DELETE CASCADE;

ALTER TABLE store__label
  DROP CONSTRAINT store__label_label_id_fkey;
ALTER TABLE store__label
  ADD CONSTRAINT store__label_label_id_fkey FOREIGN KEY (label_id) REFERENCES label (label_id) ON DELETE CASCADE;

ALTER TABLE store__label_watch
  DROP CONSTRAINT store__label_watch_store__label_id_fkey;
ALTER TABLE store__label_watch
  ADD CONSTRAINT store__label_watch_store__label_id_fkey FOREIGN KEY (store__label_id) REFERENCES store__label (store__label_id) ON DELETE CASCADE;

ALTER TABLE store__label_watch__user
  DROP CONSTRAINT store__label_watch__user_store__label_watch_id_fkey;
ALTER TABLE store__label_watch
  ADD CONSTRAINT store__label_watch__user_store__label_watch_id_fkey FOREIGN KEY (store__label_watch_id) REFERENCES store__label_watch (store__label_watch_id) ON DELETE CASCADE;

ALTER TABLE user__playlist_watch
  DROP CONSTRAINT user__playlist_watch_playlist_id_fkey;
ALTER TABLE user__playlist_watch
  ADD CONSTRAINT user__playlist_watch_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES playlist (playlist_id) ON DELETE CASCADE;

ALTER TABLE user__artist__label_ignore
  DROP CONSTRAINT user__artist__label_ignore_artist_id_fkey;
ALTER TABLE user__artist__label_ignore
  ADD CONSTRAINT user__artist__label_ignore_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES artist (artist_id) ON DELETE CASCADE;

ALTER TABLE user__artist__label_ignore
  DROP CONSTRAINT user__artist__label_ignore_label_id_fkey;
ALTER TABLE user__artist__label_ignore
  ADD CONSTRAINT user__artist__label_ignore_label_id_fkey FOREIGN KEY (label_id) REFERENCES label (label_id) ON DELETE CASCADE;

ALTER TABLE user__artist__label_ignore
  DROP CONSTRAINT user__artist__label_ignore_meta_account_user_id_fkey;
ALTER TABLE user__artist__label_ignore
  ADD CONSTRAINT user__artist__label_ignore_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES meta_account (meta_account_user_id) ON DELETE CASCADE;

ALTER TABLE track__cart
  DROP CONSTRAINT track__cart_track_id_fkey;
ALTER TABLE track__cart
  ADD CONSTRAINT track__cart_track_id_fkey FOREIGN KEY (track_id) REFERENCES track (track_id) ON DELETE CASCADE;
ALTER TABLE track__cart
  DROP CONSTRAINT track__cart_cart_id_fkey;
ALTER TABLE track__cart
  ADD CONSTRAINT track__cart_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES cart (cart_id) ON DELETE CASCADE;

ALTER TABLE user__track
  DROP CONSTRAINT user__track_track_id_fkey;
ALTER TABLE user__track
  ADD CONSTRAINT user__track_track_id_fkey FOREIGN KEY (track_id) REFERENCES track (track_id) ON DELETE CASCADE;

ALTER TABLE release__track
  DROP CONSTRAINT release__track_track_id_fkey;
ALTER TABLE release__track
  ADD CONSTRAINT release__track_track_id_fkey FOREIGN KEY (track_id) REFERENCES track (track_id) ON DELETE CASCADE;

ALTER TABLE release__track
  DROP CONSTRAINT release__track_release_id_fkey;
ALTER TABLE release__track
  ADD CONSTRAINT release__track_release_id_fkey FOREIGN KEY (release_id) REFERENCES release (release_id) ON DELETE CASCADE;

ALTER TABLE track__key
  DROP CONSTRAINT track__key_track_id_fkey;
ALTER TABLE track__key
  ADD CONSTRAINT track__key_track_id_fkey FOREIGN KEY (track_id) REFERENCES track (track_id) ON DELETE CASCADE;

ALTER TABLE user__store__track_purchased
  DROP CONSTRAINT user__store__track_purchased_meta_account_user_id_fkey;
ALTER TABLE user__store__track_purchased
  ADD CONSTRAINT user__store__track_purchased_meta_account_user_id_fkey FOREIGN KEY (meta_account_user_id) REFERENCES meta_account (meta_account_user_id) ON DELETE CASCADE;

ALTER TABLE user__store__track_purchased
  DROP CONSTRAINT user__store__track_purchased_store__track_id_fkey;
ALTER TABLE user__store__track_purchased
  ADD CONSTRAINT user__store__track_purchased_store__track_id_fkey FOREIGN KEY (store__track_id) REFERENCES store__track (store__track_id) ON DELETE CASCADE;

ALTER TABLE store__track
  DROP CONSTRAINT store__track_track_id_fkey;
ALTER TABLE store__track
  ADD CONSTRAINT store__track_track_id_fkey FOREIGN KEY (track_id) REFERENCES track (track_id) ON DELETE CASCADE;

ALTER TABLE store__track
  DROP CONSTRAINT store__track_store_id_fkey;
ALTER TABLE store__track
  ADD CONSTRAINT store__track_store_id_fkey FOREIGN KEY (store_id) REFERENCES store (store_id) ON DELETE CASCADE;

ALTER TABLE store__track_preview
  DROP CONSTRAINT store__track_preview_store__track_id_fkey;
ALTER TABLE store__track_preview
  ADD CONSTRAINT store__track_preview_store__track_id_fkey FOREIGN KEY (store__track_id) REFERENCES store__track ON DELETE CASCADE;

ALTER TABLE store__track_preview_waveform
  DROP CONSTRAINT store__track_preview_waveform_store__track_preview_id_fkey;
ALTER TABLE store__track_preview_waveform
  ADD CONSTRAINT store__track_preview_waveform_store__track_preview_id_fkey FOREIGN KEY (store__track_preview_id) REFERENCES store__track_preview (store__track_preview_id) ON DELETE CASCADE;
