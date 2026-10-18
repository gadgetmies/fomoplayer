DELETE FROM job_schedule WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'notifySampleMatches');
DELETE FROM job WHERE job_name = 'notifySampleMatches';
DROP INDEX IF EXISTS idx_user_notification_audio_sample_match_unnotified;
ALTER TABLE user_notification_audio_sample_match
  DROP COLUMN IF EXISTS user_notification_audio_sample_match_notified_at;
