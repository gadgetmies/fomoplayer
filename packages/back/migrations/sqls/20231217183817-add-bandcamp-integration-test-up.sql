INSERT INTO job (job_name) VALUES ('bandcampIntegrationTest');

INSERT INTO job_schedule (job_id, job_schedule) SELECT job_id, '0 4 * * *' FROM job WHERE job_name = 'bandcampIntegrationTest';