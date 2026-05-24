-- Artists whose name looks like it bundles several artists (e.g. "Sleepnet &
-- Lumen", "Unglued x Whiney", "Camo & Krooked featuring Rezar"), populated by
-- detectArtistSplitCandidates for admin review. Splitting re-credits the
-- artist's tracks to the real individual artists and retires the bundle.
CREATE TABLE artist_split_candidate (
  artist_split_candidate_id          SERIAL PRIMARY KEY,
  artist_id                          INTEGER NOT NULL UNIQUE REFERENCES artist (artist_id) ON DELETE CASCADE,
  artist_split_candidate_name        TEXT NOT NULL,
  artist_split_candidate_suggestions JSONB NOT NULL DEFAULT '[]',
  artist_split_candidate_status      TEXT NOT NULL DEFAULT 'new'
    CHECK (artist_split_candidate_status IN ('new', 'ignored', 'split')),
  artist_split_candidate_added       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  artist_split_candidate_checked_at  TIMESTAMPTZ
);

INSERT INTO job (job_name, job_enabled) VALUES ('detectArtistSplitCandidates', TRUE)
ON CONFLICT (job_name) DO UPDATE SET job_enabled = TRUE;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '0 4 * * *'
FROM job
WHERE job_name = 'detectArtistSplitCandidates'
ON CONFLICT (job_id) DO NOTHING;
