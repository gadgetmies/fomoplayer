DROP MATERIALIZED VIEW track_date_released_score;
CREATE MATERIALIZED VIEW track_date_released_score AS
SELECT
    track.track_id
  , GREATEST(0, DATE_PART('days'::TEXT, NOW() - MAX(store__track.store__track_released)::TIMESTAMP WITH TIME ZONE))::NUMERIC AS score
FROM
    track
        JOIN store__track USING (track_id)
GROUP BY
    track.track_id;
REFRESH MATERIALIZED VIEW track_date_released_score;

DROP MATERIALIZED VIEW track_date_added_score;
CREATE MATERIALIZED VIEW track_date_added_score AS
SELECT
    track.track_id
  , DATE_PART('days', NOW() - track.track_added)::NUMERIC AS score
FROM
    track;
REFRESH MATERIALIZED VIEW track_date_added_score;

DROP MATERIALIZED VIEW track_date_published_score;
CREATE MATERIALIZED VIEW track_date_published_score AS
SELECT
    track.track_id
  , GREATEST(0, DATE_PART('days',
              NOW() - MIN(store__track.store__track_published)::TIMESTAMP WITH TIME ZONE))::NUMERIC AS score
FROM
    track
        JOIN store__track USING (track_id)
GROUP BY
    track.track_id;
REFRESH MATERIALIZED VIEW track_date_published_score;