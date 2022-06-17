DROP MATERIALIZED VIEW track_date_published_score;
CREATE MATERIALIZED VIEW track_date_published_score AS
SELECT track_id,
       DATE_PART('days', NOW() - MIN(store__track_published)) AS score
FROM track
         NATURAL JOIN store__track
GROUP BY track_id;
REFRESH MATERIALIZED VIEW track_date_published_score;

DROP MATERIALIZED VIEW track_date_added_score;
CREATE MATERIALIZED VIEW track_date_added_score AS
SELECT track_id, 60 - LEAST(60, DATE_PART('days', NOW() - LEAST(NOW(), track_added))) AS score
FROM track;
REFRESH MATERIALIZED VIEW track_date_added_score;

DROP MATERIALIZED VIEW track_date_released_score;
CREATE MATERIALIZED VIEW track_date_released_score AS
SELECT track_id,
       60 - LEAST(60, DATE_PART('days', NOW() - LEAST(NOW(), MIN(store__track_released)))) AS score
FROM track
         NATURAL JOIN store__track
GROUP BY track_id;
REFRESH MATERIALIZED VIEW track_date_released_score;

