CREATE TABLE IF NOT EXISTS store__label_watch
(
    store__label_watch_id          SERIAL PRIMARY KEY,
    store__label_id                INTEGER REFERENCES store__label (store__label_id) UNIQUE,
    store__label_watch_last_update TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS store__label_watch__user
(
    store__label_watch_id INTEGER REFERENCES store__label_watch (store__label_watch_id),
    meta_account_user_id  INTEGER REFERENCES meta_account (meta_account_user_id),
    UNIQUE (store__label_watch_id, meta_account_user_id)
);

CREATE TABLE IF NOT EXISTS store__artist_watch
(
    store__artist_watch_id          SERIAL PRIMARY KEY,
    store__artist_id                INTEGER REFERENCES store__artist (store__artist_id) UNIQUE,
    store__artist_watch_last_update TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS store__artist_watch__user
(
    store__artist_watch_id INTEGER REFERENCES store__artist_watch (store__artist_watch_id),
    meta_account_user_id   INTEGER REFERENCES meta_account (meta_account_user_id),
    UNIQUE (store__artist_watch_id, meta_account_user_id)
);

INSERT INTO job (job_name)
VALUES ('fetchBeatportWatches')
ON CONFLICT DO NOTHING;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '*/10 * * * *'
FROM job
WHERE job_name = 'fetchBeatportWatches' ON CONFLICT DO NOTHING;
