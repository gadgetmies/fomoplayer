CREATE TABLE playlist
(
    playlist_id       SERIAL PRIMARY KEY,
    playlist_title    TEXT                                NOT NULL,
    playlist_store_id TEXT                                NOT NULL,
    store_id          INTEGER REFERENCES store (store_id) NOT NULL,
    UNIQUE (store_id, playlist_store_id)
);

CREATE TABLE user__playlist_watch
(
    user__playlist_watch_id          SERIAL PRIMARY KEY,
    playlist_id                      INTEGER REFERENCES playlist (playlist_id),
    meta_account_user_id             INTEGER REFERENCES meta_account (meta_account_user_id) NOT NULL,
    user__playlist_watch_last_update TIMESTAMPTZ,
    UNIQUE (playlist_id, meta_account_user_id)
);

INSERT INTO store (store_name, store_url)
VALUES ('Spotify', 'https://www.spotify.com');

ALTER TABLE store ADD COLUMN store_playlist_regex TEXT;
UPDATE store SET store_playlist_regex = '/^https:\/\/www\.beatport\.com/' WHERE store_name = 'Beatport';
UPDATE store SET store_playlist_regex = '/^https:\/\/([^.]+)\.bandcamp\.com/' WHERE store_name = 'Bandcamp';
UPDATE store SET store_playlist_regex = '/^https:\/\/open.spotify.com\/playlist\/([0-9A-Za-z]+)/' WHERE store_name = 'Spotify';

INSERT INTO job (job_name)
VALUES ('fetchSpotifyWatches');

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '* * * * *'
FROM job
WHERE job_name = 'fetchSpotifyWatches';

ALTER table playlist alter column playlist_title DROP DEFAULT;
