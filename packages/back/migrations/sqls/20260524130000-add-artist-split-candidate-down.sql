DELETE FROM job_schedule WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'detectArtistSplitCandidates');
DELETE FROM job WHERE job_name = 'detectArtistSplitCandidates';
DROP TABLE IF EXISTS artist_split_candidate;
