CREATE TABLE user__store__track_purchased (
  meta_account_user_id              INTEGER REFERENCES meta_account (meta_account_user_id)   NOT NULL,
  store__track_id                   INTEGER REFERENCES store__track (store__track_id)        NOT NULL,
  user__store__track_purchased_time TIMESTAMPTZ                                              NOT NULL DEFAULT NOW(),
  UNIQUE (meta_account_user_id, store__track_id)
);
