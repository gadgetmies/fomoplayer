UPDATE job_schedule
SET
    job_schedule = '0 0 * * *'
WHERE
        job_id IN (SELECT
                       job_id
                   FROM
                       job
                   WHERE
                           job_name IN ('updateDateAddedScore',
                                        'updateDateReleasedScore',
                                        'updateDatePublishedScore'
                           )); 