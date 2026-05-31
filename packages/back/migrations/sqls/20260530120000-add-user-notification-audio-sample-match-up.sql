CREATE TABLE user_notification_audio_sample_match
(
    user_notification_audio_sample_id                   INTEGER REFERENCES user_notification_audio_sample (user_notification_audio_sample_id) ON DELETE CASCADE NOT NULL,
    store__track_preview_id                             INTEGER REFERENCES store__track_preview (store__track_preview_id) ON DELETE CASCADE NOT NULL,
    user_notification_audio_sample_match_score          INTEGER NOT NULL,
    user_notification_audio_sample_match_threshold      FLOAT NOT NULL,
    user_notification_audio_sample_match_bucket_seconds FLOAT NOT NULL,
    user_notification_audio_sample_match_matched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_notification_audio_sample_id, store__track_preview_id)
);

CREATE INDEX idx_user_notification_audio_sample_match_sample_id
    ON user_notification_audio_sample_match (user_notification_audio_sample_id);
