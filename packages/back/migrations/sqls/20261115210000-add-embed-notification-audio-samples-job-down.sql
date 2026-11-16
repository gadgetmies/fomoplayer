DELETE FROM job_run WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'embedNotificationAudioSamples');
DELETE FROM job_schedule WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'embedNotificationAudioSamples');
DELETE FROM job WHERE job_name = 'embedNotificationAudioSamples';
