DELETE FROM job_schedule WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'analyseBandcampMislabeled');
DELETE FROM job WHERE job_name = 'analyseBandcampMislabeled';
DROP TABLE IF EXISTS bandcamp_mislabeled_artist;
DROP TABLE IF EXISTS bandcamp_mislabeled_label;
