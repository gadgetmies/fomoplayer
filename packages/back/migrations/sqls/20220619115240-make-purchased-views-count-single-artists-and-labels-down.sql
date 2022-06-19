DROP MATERIALIZED VIEW user_label_scores;
CREATE MATERIALIZED VIEW user_label_scores AS
SELECT label_id, label_name, meta_account_user_id, COUNT(*) AS user_label_scores_score
FROM
    track__label NATURAL JOIN
    label NATURAL JOIN
    track__cart NATURAL JOIN
    cart
WHERE cart_is_purchased
GROUP BY 1, 2, 3;

DROP MATERIALIZED VIEW user_artist_scores;
CREATE MATERIALIZED VIEW user_artist_scores AS
SELECT artist_id, artist_name, meta_account_user_id, COUNT(*) AS user_artist_scores_score
FROM
    track__artist NATURAL JOIN
    artist NATURAL JOIN
    track__cart NATURAL JOIN
    cart
WHERE cart_is_purchased
GROUP BY 1, 2, 3;