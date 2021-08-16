CREATE TABLE user__release_ignore
(
  user__release_ignore   SERIAL PRIMARY KEY,
  release_id             INTEGER REFERENCES release (release_id),
  meta_account_user_id INTEGER REFERENCES meta_account (meta_account_user_id),
  UNIQUE (release_id, meta_account_user_id)
);
