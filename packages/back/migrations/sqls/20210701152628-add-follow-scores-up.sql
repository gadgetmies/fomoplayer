INSERT INTO user_track_score_weight
  (user_track_score_weight_multiplier, user_track_score_weight_code, meta_account_user_id)
SELECT
  1
, 'artist_follow'
, meta_account_user_id
FROM meta_account;

INSERT INTO user_track_score_weight
  (user_track_score_weight_multiplier, user_track_score_weight_code, meta_account_user_id)
SELECT
  1
, 'label_follow'
, meta_account_user_id
FROM meta_account;
