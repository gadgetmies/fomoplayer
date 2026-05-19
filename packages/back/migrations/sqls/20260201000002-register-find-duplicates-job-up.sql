INSERT INTO job (job_name) VALUES ('findDuplicates') ON CONFLICT (job_name) DO NOTHING;
INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '0 2 * * *'
FROM job
WHERE job_name = 'findDuplicates'
ON CONFLICT (job_id) DO NOTHING;
