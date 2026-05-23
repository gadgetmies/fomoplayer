DELETE FROM job_schedule
WHERE job_id = (SELECT job_id FROM job WHERE job_name = 'updateArtistCollaborationScores');

DELETE FROM job WHERE job_name = 'updateArtistCollaborationScores';

DELETE FROM user_track_score_weight WHERE user_track_score_weight_code = 'artist_collaboration';

DROP MATERIALIZED VIEW IF EXISTS artist_collaboration;
