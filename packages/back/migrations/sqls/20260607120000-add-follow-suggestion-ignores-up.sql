CREATE TABLE user__artist_follow_suggestion_ignore
(
    user__artist_follow_suggestion_ignore_id SERIAL PRIMARY KEY,
    artist_id                                INTEGER NOT NULL REFERENCES artist (artist_id) ON DELETE CASCADE,
    meta_account_user_id                     INTEGER NOT NULL REFERENCES meta_account (meta_account_user_id) ON DELETE CASCADE,
    UNIQUE (artist_id, meta_account_user_id)
);

CREATE INDEX idx_user__artist_follow_suggestion_ignore_user
    ON user__artist_follow_suggestion_ignore (meta_account_user_id);

CREATE TABLE user__label_follow_suggestion_ignore
(
    user__label_follow_suggestion_ignore_id SERIAL PRIMARY KEY,
    label_id                                INTEGER NOT NULL REFERENCES label (label_id) ON DELETE CASCADE,
    meta_account_user_id                    INTEGER NOT NULL REFERENCES meta_account (meta_account_user_id) ON DELETE CASCADE,
    UNIQUE (label_id, meta_account_user_id)
);

CREATE INDEX idx_user__label_follow_suggestion_ignore_user
    ON user__label_follow_suggestion_ignore (meta_account_user_id);
