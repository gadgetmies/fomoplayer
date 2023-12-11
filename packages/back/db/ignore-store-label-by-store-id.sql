UPDATE store__label
SET store__label_ignored = TRUE
WHERE (SELECT store__label_id
       FROM
         label
         NATURAL JOIN store__label
       WHERE store__label_store_id = STORE_LABEL_ID)
;