CREATE TABLE bandcamp_mislabeled_artist (
  bandcamp_mislabeled_artist_id SERIAL PRIMARY KEY,
  artist_id INTEGER REFERENCES artist(artist_id) ON DELETE CASCADE NOT NULL UNIQUE,
  bandcamp_mislabeled_artist_url TEXT NOT NULL,
  bandcamp_mislabeled_artist_reason TEXT NOT NULL,
  bandcamp_mislabeled_artist_similarity NUMERIC(4, 2),
  bandcamp_mislabeled_artist_detected_page_type TEXT,
  bandcamp_mislabeled_artist_status TEXT NOT NULL DEFAULT 'new' CHECK (bandcamp_mislabeled_artist_status IN ('new', 'ignored')),
  bandcamp_mislabeled_artist_added TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bandcamp_mislabeled_artist_checked_at TIMESTAMPTZ
);

CREATE TABLE bandcamp_mislabeled_label (
  bandcamp_mislabeled_label_id SERIAL PRIMARY KEY,
  label_id INTEGER REFERENCES label(label_id) ON DELETE CASCADE NOT NULL UNIQUE,
  bandcamp_mislabeled_label_url TEXT NOT NULL,
  bandcamp_mislabeled_label_reason TEXT NOT NULL,
  bandcamp_mislabeled_label_similarity NUMERIC(4, 2),
  bandcamp_mislabeled_label_detected_page_type TEXT,
  bandcamp_mislabeled_label_status TEXT NOT NULL DEFAULT 'new' CHECK (bandcamp_mislabeled_label_status IN ('new', 'ignored')),
  bandcamp_mislabeled_label_added TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bandcamp_mislabeled_label_checked_at TIMESTAMPTZ
);

INSERT INTO job (job_name) VALUES ('analyseBandcampMislabeled') ON CONFLICT (job_name) DO NOTHING;
INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '30 3 * * *'
FROM job
WHERE job_name = 'analyseBandcampMislabeled'
ON CONFLICT (job_id) DO NOTHING;
