INSERT INTO job (job_name)
VALUES ('fetchBandcampWatches')
ON CONFLICT DO NOTHING;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '*/10 * * * *'
FROM job
WHERE job_name = 'fetchBandcampWatches' ON CONFLICT DO NOTHING;
