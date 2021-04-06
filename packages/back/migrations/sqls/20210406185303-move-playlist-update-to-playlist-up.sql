ALTER TABLE playlist
    ADD COLUMN playlist_last_update TIMESTAMPTZ;

UPDATE playlist p
SET playlist_last_update = (SELECT MAX(user__playlist_watch_last_update)
                            FROM user__playlist_watch upw
                            WHERE p.playlist_id = upw.playlist_id);

ALTER TABLE user__playlist_watch DROP COLUMN user__playlist_watch_last_update;
