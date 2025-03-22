INSERT INTO job (job_name)
VALUES ('sendInvites')
ON CONFLICT DO NOTHING;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '0 17 * * *'
FROM job
WHERE job_name = 'sendInvites' ON CONFLICT DO NOTHING;
