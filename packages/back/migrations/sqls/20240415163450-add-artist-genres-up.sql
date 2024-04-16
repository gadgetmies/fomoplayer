CREATE TABLE artist__genre
(
  artist__genre_id SERIAL PRIMARY KEY,
  artist_id        INTEGER REFERENCES artist (artist_id) ON DELETE CASCADE,
  genre_id         INTEGER REFERENCES genre (genre_id) NOT NULL,
  UNIQUE (artist_id, genre_id)
)
;

ALTER TABLE artist DROP CONSTRAINT artist_artist_name_key;