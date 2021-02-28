CREATE MATERIALIZED VIEW track_date_added_score AS
SELECT track_id, DATE_PART('days', NOW() - track_added) AS score
FROM track;
REFRESH MATERIALIZED VIEW track_date_added_score;

INSERT INTO job (job_name)
VALUES ('updateDateAddedScore');

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '0 0 * * *'
FROM job
WHERE job_name = 'updateDateAddedScore';
