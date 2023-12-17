INSERT INTO job (job_name) VALUES ('beatportIntegrationTest');

INSERT INTO job_schedule (job_id, job_schedule) SELECT job_id, '0 3 * * *' FROM job WHERE job_name = 'beatportIntegrationTest';