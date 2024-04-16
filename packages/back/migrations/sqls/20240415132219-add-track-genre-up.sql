CREATE TABLE genre
(
  genre_id     SERIAL PRIMARY KEY,
  genre_name   TEXT NOT NULL,
  genre_parent INTEGER REFERENCES genre (genre_id),
  UNIQUE (genre_name)
)
;

CREATE TABLE store__genre
(
  store__genre_id        SERIAL PRIMARY KEY,
  genre_id               INTEGER REFERENCES genre (genre_id) NOT NULL,
  store__genre_store_id  TEXT                                NOT NULL,
  store__genre_name      TEXT                                NOT NULL,
  store__genre_url       TEXT,
  store__genre_parent_id INTEGER REFERENCES store__genre (store__genre_id),
  store_id               INTEGER REFERENCES store (store_id) NOT NULL,
  UNIQUE (store_id, store__genre_store_id),
  UNIQUE (store_id, store__genre_name),
  UNIQUE (store__genre_url)
)
;

CREATE TABLE track__genre
(
  track__genre_id SERIAL PRIMARY KEY,
  track_id        INTEGER REFERENCES track (track_id) ON DELETE CASCADE NOT NULL,
  genre_id        INTEGER REFERENCES genre (genre_id) ON DELETE CASCADE NOT NULL,
  UNIQUE (track_id, genre_id)
)
;
