ALTER TABLE user__store_authorization
  ADD COLUMN user__store_authorization_has_write_access BOOLEAN NOT NULL DEFAULT FALSE
;