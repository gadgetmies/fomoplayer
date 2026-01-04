CREATE TABLE user_notification_audio_sample
(
    user_notification_audio_sample_id          SERIAL PRIMARY KEY,
    meta_account_user_id                       INTEGER REFERENCES meta_account (meta_account_user_id) ON DELETE CASCADE NOT NULL,
    user_notification_audio_sample_bucket_name TEXT NOT NULL,
    user_notification_audio_sample_object_key TEXT NOT NULL,
    user_notification_audio_sample_url        TEXT NOT NULL,
    user_notification_audio_sample_file_size  BIGINT NOT NULL,
    user_notification_audio_sample_file_type  TEXT NOT NULL,
    user_notification_audio_sample_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (meta_account_user_id, user_notification_audio_sample_object_key)
);

CREATE INDEX idx_user_notification_audio_sample_user_id ON user_notification_audio_sample(meta_account_user_id);

CREATE TABLE user_notification_audio_sample_embedding
(
    user_notification_audio_sample_id                    BIGINT REFERENCES user_notification_audio_sample (user_notification_audio_sample_id) ON DELETE CASCADE NOT NULL,
    user_notification_audio_sample_embedding           VECTOR(1280) NOT NULL,
    user_notification_audio_sample_embedding_type      TEXT NOT NULL,
    user_notification_audio_sample_embedding_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_notification_audio_sample_id, user_notification_audio_sample_embedding_type)
);

CREATE INDEX idx_user_notification_audio_sample_embedding_sample_id ON user_notification_audio_sample_embedding(user_notification_audio_sample_id);

