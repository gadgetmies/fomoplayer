INSERT INTO job (job_name)
VALUES ('findMatchingTracks')
;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '*/5 * * * *'
FROM
  job
WHERE job_name = 'findMatchingTracks'
;