-- The mislabeled-entity check now piggybacks on the Bandcamp watch fetch jobs
-- (classifying the page they already load), so the dedicated page-fetching
-- analysis job and its last-checked tracking table are no longer needed.
DROP TABLE IF EXISTS bandcamp_entity_check;
DELETE FROM job_schedule WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'analyseBandcampMislabeled');
DELETE FROM job WHERE job_name = 'analyseBandcampMislabeled';
