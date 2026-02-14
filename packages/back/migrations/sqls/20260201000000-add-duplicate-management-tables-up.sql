CREATE TABLE suspected_duplicate_artist (
  suspected_duplicate_artist_id SERIAL PRIMARY KEY,
  artist_id_1 INTEGER REFERENCES artist(artist_id) ON DELETE CASCADE NOT NULL,
  artist_id_2 INTEGER REFERENCES artist(artist_id) ON DELETE CASCADE NOT NULL,
  suspected_duplicate_artist_status TEXT NOT NULL DEFAULT 'new' CHECK (suspected_duplicate_artist_status IN ('new', 'ignored', 'merged')),
  suspected_duplicate_artist_added TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT suspected_duplicate_artist_order_check CHECK (artist_id_1 < artist_id_2),
  UNIQUE (artist_id_1, artist_id_2)
);

CREATE TABLE suspected_duplicate_track (
  suspected_duplicate_track_id SERIAL PRIMARY KEY,
  track_id_1 INTEGER REFERENCES track(track_id) ON DELETE CASCADE NOT NULL,
  track_id_2 INTEGER REFERENCES track(track_id) ON DELETE CASCADE NOT NULL,
  suspected_duplicate_track_status TEXT NOT NULL DEFAULT 'new' CHECK (suspected_duplicate_track_status IN ('new', 'ignored', 'merged')),
  suspected_duplicate_track_added TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT suspected_duplicate_track_order_check CHECK (track_id_1 < track_id_2),
  UNIQUE (track_id_1, track_id_2)
);

CREATE TABLE suspected_duplicate_release (
  suspected_duplicate_release_id SERIAL PRIMARY KEY,
  release_id_1 INTEGER REFERENCES release(release_id) ON DELETE CASCADE NOT NULL,
  release_id_2 INTEGER REFERENCES release(release_id) ON DELETE CASCADE NOT NULL,
  suspected_duplicate_release_status TEXT NOT NULL DEFAULT 'new' CHECK (suspected_duplicate_release_status IN ('new', 'ignored', 'merged')),
  suspected_duplicate_release_added TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT suspected_duplicate_release_order_check CHECK (release_id_1 < release_id_2),
  UNIQUE (release_id_1, release_id_2)
);
