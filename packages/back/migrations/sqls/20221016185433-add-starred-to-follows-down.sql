ALTER TABLE store__artist_watch__user DROP COLUMN store__artist_watch__user_starred;
ALTER TABLE store__label_watch__user DROP COLUMN store__label_watch__user_starred;
ALTER TABLE user__playlist_watch DROP COLUMN user__playlist_watch_starred;

ALTER TABLE store__artist_watch__user DROP COLUMN store__artist_watch__user_id;
ALTER TABLE store__label_watch__user DROP COLUMN store__label_watch__user_id;