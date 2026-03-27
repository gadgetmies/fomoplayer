INSERT INTO job (job_name)
VALUES ('fetchJunodownloadWatches')
ON CONFLICT DO NOTHING;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '*/10 * * * *'
FROM job
WHERE job_name = 'fetchJunodownloadWatches'
ON CONFLICT (job_id) DO NOTHING;
