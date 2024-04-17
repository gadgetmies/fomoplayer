INSERT INTO job (job_name)
VALUES ('removeOldSources')
ON CONFLICT DO NOTHING;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '0 * * * *'
FROM job
WHERE job_name = 'removeOldSources' ON CONFLICT DO NOTHING;
