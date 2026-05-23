-- Precomputed count of how many tracks each artist has on each label.
--
-- A row (artist_id, label_id, track_count) lets the discovery query reward
-- candidate tracks by how prolific their artists are on the labels that the
-- user's followed/starred artists release on, without scanning track__artist /
-- track__label at request time.
--
-- This aggregate is naturally bounded (one row per distinct artist/label pair,
-- roughly linear in the catalogue) and, unlike a pairwise graph, cannot blow up
-- on "Various Artists" releases: a compilation with N artists on one label adds
-- N rows, not N^2.
CREATE MATERIALIZED VIEW artist_label_track_count AS
SELECT
    ta.artist_id
  , tl.label_id
  , COUNT(DISTINCT ta.track_id) AS track_count
FROM track__artist ta
         JOIN track__label tl ON tl.track_id = ta.track_id
GROUP BY ta.artist_id, tl.label_id;

-- Unique index doubles as the lookup index on artist_id and is required for
-- REFRESH MATERIALIZED VIEW CONCURRENTLY (used by the scheduled refresh job so
-- discovery queries are never blocked by a refresh).
CREATE UNIQUE INDEX artist_label_track_count_artist_label_idx
    ON artist_label_track_count (artist_id, label_id);

REFRESH MATERIALIZED VIEW artist_label_track_count;

-- Give every existing user a default weight for the new sorting attribute. The
-- score is a raw track count, so the default multiplier is small to keep it in
-- the same range as the other rewards; users can raise it with the slider.
INSERT INTO user_track_score_weight
    (user_track_score_weight_multiplier, user_track_score_weight_code, meta_account_user_id)
SELECT 0.1, 'label_affinity', meta_account_user_id
FROM meta_account ma
WHERE NOT EXISTS (
    SELECT 1
    FROM user_track_score_weight w
    WHERE w.meta_account_user_id = ma.meta_account_user_id
      AND w.user_track_score_weight_code = 'label_affinity'
);

-- Refresh once a day; the aggregate changes slowly and the rebuild is heavier
-- than the per-track score views, so it does not need the 10-minute cadence
-- those use.
INSERT INTO job (job_name)
VALUES ('updateArtistLabelTrackCounts')
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '45 3 * * *'
FROM job
WHERE job_name = 'updateArtistLabelTrackCounts'
ON CONFLICT (job_id) DO NOTHING;
