CREATE TABLE IF NOT EXISTS job_run
(
    job_run_id      SERIAL PRIMARY KEY,
    job_id          INTEGER REFERENCES job (job_id),
    job_run_started TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    job_run_ended   TIMESTAMPTZ,
    job_run_success BOOLEAN,
    job_run_result  JSON
);
