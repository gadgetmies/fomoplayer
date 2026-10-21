-- Where the sample sits inside the matched preview and at which tempo, as found
-- by the slope-aware matcher (matchFingerprints' peak_offset_seconds and
-- peak_tempo_factor). The player uses them to switch between the sample and the
-- match on the same beat. NULL on rows persisted before these columns existed
-- until the sample is rescored.
ALTER TABLE user_notification_audio_sample_match
  ADD COLUMN user_notification_audio_sample_match_offset_seconds DOUBLE PRECISION,
  ADD COLUMN user_notification_audio_sample_match_tempo_factor   DOUBLE PRECISION;
