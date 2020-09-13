CREATE TABLE release (
    release_id SERIAL PRIMARY KEY,
    release_name TEXT NOT NULL
);

CREATE TABLE store__release (
    release_id INTEGER REFERENCES release(release_id) NOT NULL,
    store_id INTEGER REFERENCES store(store_id) NOT NULL,
    store__release_store_id TEXT NOT NULL,
    store__release_url TEXT NOT NULL,
    UNIQUE (store_id, store__release_store_id)
);

CREATE TABLE release__track (
    release_id INTEGER REFERENCES release(release_id) NOT NULL,
    track_id INTEGER REFERENCES track(track_id) NOT NULL,
    UNIQUE (release_id, track_id)
);
