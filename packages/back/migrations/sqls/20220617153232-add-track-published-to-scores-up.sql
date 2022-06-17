CREATE MATERIALIZED VIEW track_date_published_score AS
SELECT track_id,
       DATE_PART('days', NOW() - MIN(store__track_published)) AS score
FROM track
         NATURAL JOIN store__track
GROUP BY track_id;
REFRESH MATERIALIZED VIEW track_date_published_score;

INSERT INTO job (job_name)
VALUES ('updateDatePublishedScore');

INSERT INTO user_track_score_weight (meta_account_user_id, user_track_score_weight_code,
                                     user_track_score_weight_multiplier)
SELECT meta_account_user_id, 'date_released', user_track_score_weight_multiplier
FROM user_track_score_weight
WHERE user_track_score_weight_code = 'date_published' ON CONFLICT DO NOTHING;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '0 0 * * *'
FROM job
WHERE job_name = 'updateDatePublishedScore';
