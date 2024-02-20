ALTER TABLE user__store_authorization
  ADD COLUMN user__store_authorization_has_write_access BOOLEAN NOT NULL DEFAULT FALSE
;

UPDATE user__store_authorization
SET user__store_authorization_has_write_access = user__store_authorization_scopes <@ '{playlist-modify-private}'
;

ALTER TABLE user__store_authorization
  DROP COLUMN user__store_authorization_scopes
;
