CREATE TABLE job (job_id SERIAL PRIMARY KEY, job_name TEXT UNIQUE NOT NULL);
CREATE TABLE job_schedule (job_id INTEGER UNIQUE REFERENCES job ON DELETE CASCADE, job_schedule TEXT NOT NULL);

INSERT INTO job (job_id, job_name) VALUES (1, 'updateJobs');
INSERT INTO job_schedule (job_id, job_schedule) VALUES (1, '*/5 * * * *');
