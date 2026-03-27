DELETE FROM job_schedule
WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'junodownloadIntegrationTest');

DELETE FROM job
WHERE job_name = 'junodownloadIntegrationTest';
