DELETE FROM job_schedule WHERE job_id IN (SELECT job_id FROM job WHERE job_name = 'detectBandcampArtistNameMismatches');
DELETE FROM job WHERE job_name = 'detectBandcampArtistNameMismatches';
DROP TABLE IF EXISTS bandcamp_artist_name_mismatch;
