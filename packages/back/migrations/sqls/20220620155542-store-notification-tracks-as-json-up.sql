ALTER TABLE user_search_notification
    ADD COLUMN user_search_notification_tracks BIGINT[];

UPDATE user_search_notification u
SET user_search_notification_tracks = t.ids
FROM (SELECT user_search_notification_id, array_agg(track_id) AS ids
      FROM user_search_notification__track
      GROUP BY user_search_notification_id) t
WHERE t.user_search_notification_id = u.user_search_notification_id;

DROP TABLE user_search_notification__track;