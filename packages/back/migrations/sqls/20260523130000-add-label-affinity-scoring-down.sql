DELETE FROM job_schedule
WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'updateArtistLabelTrackCounts');

DELETE FROM job WHERE job_name = 'updateArtistLabelTrackCounts';

DELETE FROM user_track_score_weight WHERE user_track_score_weight_code = 'label_affinity';

DROP MATERIALIZED VIEW IF EXISTS artist_label_track_count;
