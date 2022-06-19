ALTER TABLE cart
    ADD COLUMN cart_is_purchased BOOLEAN;

ALTER TABLE cart ADD UNIQUE (cart_is_purchased, meta_account_user_id);

ALTER TABLE track__cart
ADD COLUMN track__cart_added TIMESTAMPTZ NOT NULL default NOW();

INSERT INTO cart (cart_name, meta_account_user_id, cart_is_public, cart_is_purchased)
SELECT 'Purchased', meta_account_user_id, false, true
FROM meta_account
ON CONFLICT ON CONSTRAINT cart_cart_name_meta_account_user_id_key DO UPDATE SET cart_is_purchased = TRUE;

-- This will loose the info on which store the track was purchased from
INSERT INTO track__cart (cart_id, track_id)
SELECT cart_id, track_id
FROM user__store__track_purchased
         NATURAL JOIN store__track
         NATURAL JOIN cart
WHERE cart_is_purchased ON CONFLICT DO NOTHING;

DROP VIEW user_label_scores;
CREATE MATERIALIZED VIEW user_label_scores AS
SELECT label_id, label_name, meta_account_user_id, COUNT(*) AS user_label_scores_score
FROM
    track__label NATURAL JOIN
    label NATURAL JOIN
    store__track NATURAL JOIN
    track__cart NATURAL JOIN
    cart
WHERE cart_is_purchased
GROUP BY 1, 2, 3;

DROP VIEW user_artist_scores;
CREATE MATERIALIZED VIEW user_artist_scores AS
SELECT artist_id, artist_name, meta_account_user_id, COUNT(*) AS user_artist_scores_score
FROM
    track__artist NATURAL JOIN
    artist NATURAL JOIN
    store__track NATURAL JOIN
    track__cart NATURAL JOIN
    cart
WHERE cart_is_purchased
GROUP BY 1, 2, 3;

DROP TABLE user__store__track_purchased;

INSERT INTO job (job_name)
VALUES ('updatePurchasedScores');

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '15 * * * *'
FROM job
WHERE job_name = 'updatePurchasedScores';