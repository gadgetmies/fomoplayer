CREATE TABLE user_track_score_weight
(
    user_track_score_weight_id         SERIAL PRIMARY KEY,
    user_track_score_weight_multiplier FLOAT NOT NULL,
    user_track_score_weight_code       TEXT  NOT NULL,
    meta_account_user_id               INTEGER REFERENCES meta_account (meta_account_user_id)
);

INSERT INTO user_track_score_weight
(user_track_score_weight_multiplier, user_track_score_weight_code, meta_account_user_id)
VALUES (1, 'label', 1),
       (5, 'artist', 1),
       (-0.1, 'date_added', 1),
       (-0.1, 'date_published', 1);
