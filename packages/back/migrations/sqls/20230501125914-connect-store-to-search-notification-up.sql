CREATE TABLE IF NOT EXISTS user_search_notification__store
(
    user_search_notification_id BIGINT REFERENCES user_search_notification
(
    user_search_notification_id
) ON DELETE CASCADE NOT NULL ,
    store_id BIGINT REFERENCES store
(
    store_id
)
  ON DELETE CASCADE NOT NULL,
    UNIQUE
(
    user_search_notification_id,
    store_id
)
    );

INSERT INTO user_search_notification__store (user_search_notification_id, store_id)
SELECT user_search_notification_id, store_id
FROM user_search_notification,
     store;
