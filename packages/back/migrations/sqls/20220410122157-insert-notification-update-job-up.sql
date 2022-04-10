INSERT INTO job (job_name) VALUES ('updateNotifications');
INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '*/30 * * * *'
FROM job
WHERE job_name = 'updateNotifications';
