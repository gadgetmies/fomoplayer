DROP TABLE artist__genre;

ALTER TABLE artist ADD CONSTRAINT artist_artist_name_key UNIQUE (artist_name);