DELETE FROM job_schedule WHERE job_id IN (SELECT job_id FROM job WHERE job_name = 'refetchBandcampLabelArtists');
DELETE FROM job WHERE job_name = 'refetchBandcampLabelArtists';
DROP TABLE IF EXISTS bandcamp_label_artist_refetch;
