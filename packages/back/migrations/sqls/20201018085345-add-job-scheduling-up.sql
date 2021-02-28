CREATE TABLE job (job_id SERIAL PRIMARY KEY, job_name TEXT UNIQUE NOT NULL);
CREATE TABLE job_schedule (job_id INTEGER UNIQUE REFERENCES job ON DELETE CASCADE, job_schedule TEXT NOT NULL);

INSERT INTO job (job_name) VALUES ('updateJobs');
INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '*/10 * * * *'
FROM job
WHERE job_name = 'updateJobs';
