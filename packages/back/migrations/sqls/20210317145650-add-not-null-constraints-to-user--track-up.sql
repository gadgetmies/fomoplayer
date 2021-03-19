DELETE FROM user__track WHERE meta_account_user_id IS NULL;

ALTER TABLE user__track ALTER COLUMN meta_account_user_id SET NOT NULL;
ALTER TABLE user__track ALTER COLUMN track_id SET NOT NULL;
