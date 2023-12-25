WITH
    added_to_cart AS
        (SELECT
             meta_account_user_id
           , COUNT(*) AS "addedToCart"
         FROM
             cart
                 NATURAL JOIN track__cart
         WHERE
             track__cart_added > NOW() - INTERVAL '1 day'
         GROUP BY
             1)
  , heard AS
        (SELECT
             meta_account_user_id
           , COUNT(*) AS heard
         FROM
             cart
                 NATURAL JOIN user__track
         WHERE
             user__track_heard > NOW() - INTERVAL '1 day'
         GROUP BY
             1)
SELECT
    meta_account_user_id    AS "userId"
  , "addedToCart"
  , "heard"
  , "addedToCart"::FLOAT / "heard" AS ratio
  , NOW() :: DATE           AS "date"
FROM
    meta_account
        NATURAL LEFT JOIN added_to_cart
        NATURAL LEFT JOIN heard
;