CREATE TABLE sample_match_eval_pair
(
    user_notification_audio_sample_id INTEGER NOT NULL REFERENCES user_notification_audio_sample (user_notification_audio_sample_id) ON DELETE CASCADE,
    store__track_preview_id           INTEGER NOT NULL REFERENCES store__track_preview (store__track_preview_id) ON DELETE CASCADE,
    sample_match_eval_pair_notes      TEXT,
    PRIMARY KEY (user_notification_audio_sample_id, store__track_preview_id)
);
