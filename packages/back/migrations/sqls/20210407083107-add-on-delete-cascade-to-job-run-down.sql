ALTER TABLE job_run
    DROP CONSTRAINT job_run_job_id_fkey,
    ADD CONSTRAINT job_run_job_id_fkey FOREIGN KEY (job_id) REFERENCES job (job_id);
