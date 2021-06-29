CREATE TABLE user__artist_ignore
(
  user__artist_ignore  SERIAL PRIMARY KEY,
  artist_id            INTEGER REFERENCES artist (artist_id),
  meta_account_user_id INTEGER REFERENCES meta_account (meta_account_user_id),
  UNIQUE (artist_id, meta_account_user_id)
);

CREATE TABLE user__label_ignore
(
  user__label_ignore   SERIAL PRIMARY KEY,
  label_id             INTEGER REFERENCES label (label_id),
  meta_account_user_id INTEGER REFERENCES meta_account (meta_account_user_id),
  UNIQUE (label_id, meta_account_user_id)
);
