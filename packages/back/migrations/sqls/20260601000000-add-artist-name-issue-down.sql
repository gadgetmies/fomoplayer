DELETE FROM job_schedule WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'detectArtistNameIssues');
DELETE FROM job WHERE job_name = 'detectArtistNameIssues';
DROP TABLE IF EXISTS artist_name_issue;
