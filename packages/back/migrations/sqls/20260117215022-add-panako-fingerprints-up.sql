CREATE TABLE store__track_preview_fingerprint
(
  store__track_preview_id                   BIGINT REFERENCES store__track_preview (store__track_preview_id) ON DELETE CASCADE NOT NULL,
  store__track_preview_fingerprint_hash     BIGINT NOT NULL,
  store__track_preview_fingerprint_position FLOAT,
  store__track_preview_fingerprint_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_store__track_preview_fingerprint_preview_id ON store__track_preview_fingerprint(store__track_preview_id);
CREATE INDEX idx_store__track_preview_fingerprint_hash ON store__track_preview_fingerprint(store__track_preview_fingerprint_hash);

CREATE TABLE store__track_preview_fingerprint_meta
(
  store__track_preview_id                   BIGINT PRIMARY KEY REFERENCES store__track_preview (store__track_preview_id) ON DELETE CASCADE NOT NULL,
  store__track_preview_fingerprint_count    INTEGER NOT NULL DEFAULT 0,
  store__track_preview_fingerprint_extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_notification_audio_sample_fingerprint
(
  user_notification_audio_sample_id                    BIGINT REFERENCES user_notification_audio_sample (user_notification_audio_sample_id) ON DELETE CASCADE NOT NULL,
  user_notification_audio_sample_fingerprint_hash     BIGINT NOT NULL,
  user_notification_audio_sample_fingerprint_position FLOAT,
  user_notification_audio_sample_fingerprint_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_notification_audio_sample_fingerprint_sample_id ON user_notification_audio_sample_fingerprint(user_notification_audio_sample_id);
CREATE INDEX idx_user_notification_audio_sample_fingerprint_hash ON user_notification_audio_sample_fingerprint(user_notification_audio_sample_fingerprint_hash);

CREATE TABLE user_notification_audio_sample_fingerprint_meta
(
  user_notification_audio_sample_id                    BIGINT PRIMARY KEY REFERENCES user_notification_audio_sample (user_notification_audio_sample_id) ON DELETE CASCADE NOT NULL,
  user_notification_audio_sample_fingerprint_count    INTEGER NOT NULL DEFAULT 0,
  user_notification_audio_sample_fingerprint_extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

