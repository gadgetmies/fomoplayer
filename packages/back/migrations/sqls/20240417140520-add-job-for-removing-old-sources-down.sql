DELETE
FROM job_run
WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'removeOldSources');

DELETE
FROM job
WHERE job_name = 'removeOldSources';
