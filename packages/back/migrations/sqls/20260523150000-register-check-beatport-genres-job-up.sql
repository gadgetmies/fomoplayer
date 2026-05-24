INSERT INTO job (job_name) VALUES ('checkBeatportGenres') ON CONFLICT (job_name) DO NOTHING;
INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '0 4 * * 1'
FROM job
WHERE job_name = 'checkBeatportGenres'
ON CONFLICT (job_id) DO NOTHING;
