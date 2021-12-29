INSERT INTO job (job_name)
VALUES ('sendNextEmailBatch');

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '* * * * *'
FROM job
WHERE job_name = 'sendNextEmailBatch';