CREATE TABLE user__store__track_purchased
(
    meta_account_user_id              INTEGER REFERENCES meta_account (meta_account_user_id) NOT NULL,
    store__track_id                   INTEGER REFERENCES store__track (store__track_id)      NOT NULL,
    user__store__track_purchased_time TIMESTAMPTZ                                            NOT NULL DEFAULT NOW(),
    UNIQUE (meta_account_user_id, store__track_id)
);

INSERT INTO user__store__track_purchased (meta_account_user_id, store__track_id)
SELECT meta_account_user_id, store__track_id
FROM cart
         NATURAL JOIN track__cart
         NATURAL JOIN store__track
WHERE cart_is_purchased
GROUP BY 1, 2;

DROP MATERIALIZED VIEW user_label_scores;
CREATE VIEW user_label_scores AS
SELECT label_id, label_name, meta_account_user_id, COUNT(*) AS user_label_scores_score
FROM track__label
         NATURAL JOIN
     label
         NATURAL JOIN
     store__track
         NATURAL JOIN
     user__store__track_purchased
GROUP BY 1, 2, 3;

DROP MATERIALIZED VIEW user_artist_scores;
CREATE VIEW user_artist_scores AS
SELECT artist_id, artist_name, meta_account_user_id, COUNT(*) AS user_artist_scores_score
FROM track__artist
         NATURAL JOIN
     artist
         NATURAL JOIN
     store__track
         NATURAL JOIN
     user__store__track_purchased
GROUP BY 1, 2, 3;

DELETE
FROM job_schedule
WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'updatePurchasedScores');

DELETE
FROM job
WHERE job_name = 'updatePurchasedScores';

ALTER TABLE cart
    DROP COLUMN cart_is_purchased;
ALTER TABLE track__cart
    DROP COLUMN track__cart_added;
