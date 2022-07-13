UPDATE job_schedule
SET
    job_schedule = '*/10 * * * *'
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