-- Queue of labels (typically just converted from a mislabeled artist) whose
-- Bandcamp releases should be re-fetched so each track is re-attributed to its
-- real artists instead of the label name. Drained by the
-- refetchBandcampLabelArtists job.
CREATE TABLE bandcamp_label_artist_refetch (
  bandcamp_label_artist_refetch_id             SERIAL PRIMARY KEY,
  label_id                                     INTEGER NOT NULL UNIQUE REFERENCES label (label_id) ON DELETE CASCADE,
  bandcamp_label_artist_refetch_status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (bandcamp_label_artist_refetch_status IN ('pending', 'done', 'error')),
  bandcamp_label_artist_refetch_added          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bandcamp_label_artist_refetch_started        TIMESTAMPTZ,
  bandcamp_label_artist_refetch_finished       TIMESTAMPTZ,
  bandcamp_label_artist_refetch_error          TEXT,
  bandcamp_label_artist_refetch_releases_total INTEGER,
  bandcamp_label_artist_refetch_releases_done  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO job (job_name, job_enabled) VALUES ('refetchBandcampLabelArtists', TRUE)
ON CONFLICT (job_name) DO UPDATE SET job_enabled = TRUE;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '*/5 * * * *'
FROM job
WHERE job_name = 'refetchBandcampLabelArtists'
ON CONFLICT (job_id) DO NOTHING;
