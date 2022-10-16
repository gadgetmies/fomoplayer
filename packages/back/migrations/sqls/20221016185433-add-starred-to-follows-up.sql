ALTER TABLE store__artist_watch__user ADD COLUMN store__artist_watch__user_starred BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE store__label_watch__user ADD COLUMN store__label_watch__user_starred BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user__playlist_watch ADD COLUMN user__playlist_watch_starred BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE store__artist_watch__user ADD COLUMN store__artist_watch__user_id SERIAL NOT NULL;
ALTER TABLE store__label_watch__user ADD COLUMN store__label_watch__user_id SERIAL NOT NULL;