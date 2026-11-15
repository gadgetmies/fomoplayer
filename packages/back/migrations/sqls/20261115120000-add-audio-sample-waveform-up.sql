-- A waveform image rendered from the uploaded sample when it is uploaded, so the
-- player can show it and seek in the sample without downloading and decoding the
-- whole file in the browser. The duration lets the player lay out the timeline
-- before the audio has loaded. All three stay NULL when the sample could not be
-- decoded; the player then falls back to generating the waveform itself.
ALTER TABLE user_notification_audio_sample
  ADD COLUMN user_notification_audio_sample_waveform_object_key TEXT,
  ADD COLUMN user_notification_audio_sample_waveform_url TEXT,
  ADD COLUMN user_notification_audio_sample_duration_ms INTEGER;
