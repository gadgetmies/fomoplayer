-- Renders the waveforms of audio samples uploaded before waveforms were rendered
-- at upload. It has no schedule: an admin runs it from Admin › Jobs, and again
-- until its run reports nothing left.
INSERT INTO job (job_name, job_enabled) VALUES ('renderSampleWaveforms', TRUE)
ON CONFLICT (job_name) DO UPDATE SET job_enabled = TRUE;
