DELETE FROM job_schedule WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'prefetchPreviewAudio');
DELETE FROM job_run WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'prefetchPreviewAudio');
DELETE FROM job WHERE job_name = 'prefetchPreviewAudio';
DROP TABLE IF EXISTS store__track_preview_audio;
