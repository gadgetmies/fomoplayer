CREATE MATERIALIZED VIEW track_date_released_score AS
SELECT track_id,
       DATE_PART('days', NOW() - MIN(store__track_released)) AS score
FROM track
         NATURAL JOIN store__track
GROUP BY track_id;
REFRESH MATERIALIZED VIEW track_date_released_score;

INSERT INTO job (job_name)
VALUES ('updateDateReleasedScore');

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '0 0 * * *'
FROM job
WHERE job_name = 'updateDateReleasedScore';
