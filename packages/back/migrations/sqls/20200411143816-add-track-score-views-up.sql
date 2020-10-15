CREATE VIEW user_label_scores AS
  SELECT label_id, label_name, meta_account_user_id, COUNT(*) AS user_label_scores_score
  FROM
    track__label NATURAL JOIN
    label NATURAL JOIN
    store__track NATURAL JOIN
    user__store__track_purchased
GROUP BY 1, 2, 3;

CREATE VIEW user_artist_scores AS
  SELECT artist_id, artist_name, meta_account_user_id, COUNT(*) AS user_artist_scores_score
  FROM
    track__artist NATURAL JOIN
    artist NATURAL JOIN
    store__track NATURAL JOIN
    user__store__track_purchased
GROUP BY 1, 2, 3;

