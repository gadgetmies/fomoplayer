ALTER TABLE artist
  ADD UNIQUE (artist_name);
ALTER TABLE label
  ADD UNIQUE (label_name);
