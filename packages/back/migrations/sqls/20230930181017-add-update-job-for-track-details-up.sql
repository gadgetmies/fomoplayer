WITH update_job AS (
    INSERT INTO job (job_name) VALUES ('updateTrackDetails') RETURNING job_id)
INSERT
INTO job_schedule (job_id, job_schedule) SELECT job_id, '*/10 * * * *' FROM update_job;