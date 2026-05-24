-- Detected cases where a Bandcamp artist subdomain is linked to an artist whose
-- name does not resemble it (e.g. subdomain "machinedrum" linked to artist
-- "VIER"), which causes tracks from that page to be credited to the wrong
-- artist. Populated by detectBandcampArtistNameMismatches for admin review.
CREATE TABLE bandcamp_artist_name_mismatch (
  bandcamp_artist_name_mismatch_id           SERIAL PRIMARY KEY,
  store__artist_id                           INTEGER NOT NULL UNIQUE REFERENCES store__artist (store__artist_id) ON DELETE CASCADE,
  bandcamp_artist_name_mismatch_subdomain    TEXT NOT NULL,
  bandcamp_artist_name_mismatch_current_name TEXT NOT NULL,
  bandcamp_artist_name_mismatch_similarity   NUMERIC(4, 2),
  bandcamp_artist_name_mismatch_status       TEXT NOT NULL DEFAULT 'new'
    CHECK (bandcamp_artist_name_mismatch_status IN ('new', 'ignored')),
  bandcamp_artist_name_mismatch_added        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bandcamp_artist_name_mismatch_checked_at   TIMESTAMPTZ
);

INSERT INTO job (job_name, job_enabled) VALUES ('detectBandcampArtistNameMismatches', TRUE)
ON CONFLICT (job_name) DO UPDATE SET job_enabled = TRUE;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '0 3 * * *'
FROM job
WHERE job_name = 'detectBandcampArtistNameMismatches'
ON CONFLICT (job_id) DO NOTHING;
