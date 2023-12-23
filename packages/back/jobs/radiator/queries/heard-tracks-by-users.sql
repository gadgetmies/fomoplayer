SELECT meta_account_user_id AS "userId", COUNT(user__track_heard) AS "count", NOW() :: DATE AS "date"
FROM
  meta_account
  NATURAL LEFT JOIN user__track
WHERE user__track_heard IS NULL OR user__track_heard > NOW() - INTERVAL '1 day'
GROUP BY meta_account_user_id
;