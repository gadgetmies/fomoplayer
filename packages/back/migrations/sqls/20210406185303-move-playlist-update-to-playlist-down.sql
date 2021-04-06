ALTER TABLE user__playlist_watch ADD COLUMN user__playlist_watch_last_update TIMESTAMPTZ;

UPDATE user__playlist_watch upw
SET user__playlist_watch_last_update = (SELECT MAX(playlist_last_update)
                            FROM playlist p
                            WHERE p.playlist_id = upw.playlist_id);

ALTER TABLE playlist
    DROP COLUMN playlist_last_update;
