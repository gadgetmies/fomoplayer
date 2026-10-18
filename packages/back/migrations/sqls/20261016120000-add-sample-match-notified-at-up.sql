-- Records when the user was emailed about a fingerprint match. NULL means the
-- match has not been notified yet; notifySampleMatches picks those rows up,
-- emails the sample's owner and stamps this column. persistSampleMatches
-- upserts, so re-scoring keeps the stamp on matches that were already found.
ALTER TABLE user_notification_audio_sample_match
  ADD COLUMN user_notification_audio_sample_match_notified_at TIMESTAMPTZ;

CREATE INDEX idx_user_notification_audio_sample_match_unnotified
  ON user_notification_audio_sample_match (user_notification_audio_sample_id)
  WHERE user_notification_audio_sample_match_notified_at IS NULL;

INSERT INTO job (job_name, job_enabled) VALUES ('notifySampleMatches', TRUE)
ON CONFLICT (job_name) DO UPDATE SET job_enabled = TRUE;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '15 * * * *'
FROM job
WHERE job_name = 'notifySampleMatches'
ON CONFLICT (job_id) DO NOTHING;
