DROP MATERIALIZED VIEW track_date_released_score;
CREATE MATERIALIZED VIEW track_date_released_score AS
SELECT track_id,
       GREATEST(0, DATE_PART('days', NOW() - MIN(store__track_released)) + 60) AS score
FROM track
         NATURAL JOIN store__track
GROUP BY track_id;
REFRESH MATERIALIZED VIEW track_date_released_score;

DROP MATERIALIZED VIEW track_date_added_score;
CREATE MATERIALIZED VIEW track_date_added_score AS
SELECT track_id, DATE_PART('days', NOW() - track_added) AS score
FROM track;
REFRESH MATERIALIZED VIEW track_date_added_score;
