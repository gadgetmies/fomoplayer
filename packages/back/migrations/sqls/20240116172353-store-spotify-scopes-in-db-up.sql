ALTER TABLE user__store_authorization
  ADD COLUMN user__store_authorization_scopes TEXT[] NOT NULL DEFAULT '{}'
;

UPDATE user__store_authorization
SET user__store_authorization_scopes = '{playlist-modify-private, playlist-modify-public, user-follow-modify, playlist-read-private, playlist-read-collaborative, user-follow-read}'
WHERE user__store_authorization_has_write_access = TRUE
;

UPDATE user__store_authorization
SET user__store_authorization_scopes = '{playlist-read-private, playlist-read-collaborative, user-follow-read}'
WHERE user__store_authorization_has_write_access = FALSE
;

ALTER TABLE user__store_authorization
  DROP COLUMN user__store_authorization_has_write_access
;