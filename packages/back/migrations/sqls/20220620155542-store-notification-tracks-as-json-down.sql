CREATE TABLE user_search_notification__track
(
    user_search_notification_id INTEGER NOT NULL REFERENCES user_search_notification (user_search_notification_id) ON DELETE CASCADE,
    track_id                    INTEGER NOT NULL REFERENCES track (track_id) ON DELETE CASCADE,
    UNIQUE (user_search_notification_id, track_id)
);

INSERT INTO user_search_notification__track (user_search_notification_id, track_id)
SELECT user_search_notification_id, unnest(user_search_notification_tracks) FROM user_search_notification;

ALTER TABLE user_search_notification DROP COLUMN user_search_notification_tracks;