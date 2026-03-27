INSERT INTO job (job_name) VALUES ('junodownloadIntegrationTest');

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '0 5 * * *'
FROM job
WHERE job_name = 'junodownloadIntegrationTest'
ON CONFLICT (job_id) DO NOTHING;
