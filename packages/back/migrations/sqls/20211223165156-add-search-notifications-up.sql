CREATE TABLE user_search_notification
(
    user_search_notification_id          SERIAL PRIMARY KEY,
    meta_account_user_id                 INTEGER REFERENCES meta_account (meta_account_user_id),
    user_search_notification_string      TEXT NOT NULL,
    user_search_notification_last_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (meta_account_user_id, user_search_notification_string)
);

CREATE TABLE user_search_notification__track
(
    user_search_notification_id INTEGER NOT NULL REFERENCES user_search_notification (user_search_notification_id)  ON DELETE CASCADE,
    track_id                    INTEGER NOT NULL REFERENCES track (track_id) ON DELETE CASCADE,
    UNIQUE (user_search_notification_id, track_id)
);