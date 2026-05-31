-- Artists whose name was polluted by track-title or version metadata at
-- import time (e.g. "feat. Bar", "Foo (Bar Remix)", "(Foo)", trailing
-- punctuation), populated by detectArtistNameIssues for admin review.
-- The repair is admin-driven: a name can be renamed (strip the junk),
-- merged into the real artist, or the bogus record deleted. ON DELETE
-- CASCADE means a merge or delete that removes the source artist also
-- removes its issue row.
CREATE TABLE artist_name_issue (
  artist_name_issue_id          SERIAL PRIMARY KEY,
  artist_id                     INTEGER NOT NULL UNIQUE REFERENCES artist (artist_id) ON DELETE CASCADE,
  artist_name_issue_name        TEXT NOT NULL,
  artist_name_issue_kinds       JSONB NOT NULL DEFAULT '[]',
  artist_name_issue_suggested   TEXT,
  artist_name_issue_status      TEXT NOT NULL DEFAULT 'new'
    CHECK (artist_name_issue_status IN ('new', 'ignored', 'fixed')),
  artist_name_issue_added       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  artist_name_issue_checked_at  TIMESTAMPTZ
);

INSERT INTO job (job_name, job_enabled) VALUES ('detectArtistNameIssues', TRUE)
ON CONFLICT (job_name) DO UPDATE SET job_enabled = TRUE;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '15 4 * * *'
FROM job
WHERE job_name = 'detectArtistNameIssues'
ON CONFLICT (job_id) DO NOTHING;
