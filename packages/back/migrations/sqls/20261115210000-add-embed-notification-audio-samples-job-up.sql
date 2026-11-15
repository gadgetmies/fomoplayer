-- Embeds uploaded audio samples that have no embedding yet, through the embedding
-- service (analyser/embedding_service.py), so their Sounds like lists fill in.
-- Also started right after each upload; the schedule picks up anything left over.
INSERT INTO job (job_name, job_enabled) VALUES ('embedNotificationAudioSamples', TRUE)
ON CONFLICT (job_name) DO UPDATE SET job_enabled = TRUE;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '*/10 * * * *'
FROM job
WHERE job_name = 'embedNotificationAudioSamples'
ON CONFLICT (job_id) DO NOTHING;
