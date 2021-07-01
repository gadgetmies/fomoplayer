ALTER TABLE user_track_score_weight
  ADD UNIQUE (meta_account_user_id, user_track_score_weight_code);
