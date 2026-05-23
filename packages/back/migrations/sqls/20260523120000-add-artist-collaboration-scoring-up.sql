-- Precomputed, user-independent artist collaboration graph.
--
-- A row (artist_id, collaborator_artist_id, collaboration_strength) means that
-- `artist_id` has collaborated with `collaborator_artist_id`, with a strength
-- that follows the hierarchy co-authors (3) > same release (2) > remixer (1),
-- summed over every shared context. Pairs are stored in both directions so the
-- discovery query can look up collaborators of a followed artist with a single
-- indexed scan.
--
-- Footprint is kept bounded by skipping high-cardinality contexts that would
-- otherwise explode the pair count: tracks/releases credited to a large number
-- of artists are almost always compilations ("Various Artists") rather than
-- genuine collaborations, so they are excluded. This caps each track's
-- contribution at ARTIST_CAP^2 directed pairs and each release's at
-- RELEASE_ARTIST_CAP^2, keeping the view roughly linear in catalogue size.
CREATE MATERIALIZED VIEW artist_collaboration AS
WITH track_artist_counts AS (
    SELECT track_id, COUNT(DISTINCT artist_id) AS artist_count
    FROM track__artist
    GROUP BY track_id
),
     eligible_tracks AS (
         SELECT track_id
         FROM track_artist_counts
         WHERE artist_count BETWEEN 2 AND 8
     ),
     release_artists AS (
         SELECT DISTINCT rt.release_id, ta.artist_id
         FROM release__track rt
                  JOIN track__artist ta ON ta.track_id = rt.track_id
     ),
     eligible_release_artists AS (
         SELECT ra.release_id, ra.artist_id
         FROM release_artists ra
                  JOIN (
             SELECT release_id, COUNT(*) AS artist_count
             FROM release_artists
             GROUP BY release_id
         ) rac USING (release_id)
         WHERE rac.artist_count BETWEEN 2 AND 12
     ),
     coauthor AS (
         SELECT a.artist_id, b.artist_id AS collaborator_artist_id, 3::NUMERIC AS strength
         FROM track__artist a
                  JOIN track__artist b USING (track_id)
                  JOIN eligible_tracks USING (track_id)
         WHERE a.track__artist_role = 'author'
           AND b.track__artist_role = 'author'
           AND a.artist_id <> b.artist_id
     ),
     remixer AS (
         SELECT a.artist_id, b.artist_id AS collaborator_artist_id, 1::NUMERIC AS strength
         FROM track__artist a
                  JOIN track__artist b USING (track_id)
                  JOIN eligible_tracks USING (track_id)
         WHERE a.artist_id <> b.artist_id
           AND ((a.track__artist_role = 'remixer' AND b.track__artist_role = 'author')
             OR (a.track__artist_role = 'author' AND b.track__artist_role = 'remixer'))
     ),
     same_release AS (
         SELECT ra.artist_id, rb.artist_id AS collaborator_artist_id, 2::NUMERIC AS strength
         FROM eligible_release_artists ra
                  JOIN eligible_release_artists rb USING (release_id)
         WHERE ra.artist_id <> rb.artist_id
     )
SELECT artist_id, collaborator_artist_id, SUM(strength) AS collaboration_strength
FROM (
         SELECT * FROM coauthor
         UNION ALL
         SELECT * FROM remixer
         UNION ALL
         SELECT * FROM same_release
     ) all_collaborations
GROUP BY artist_id, collaborator_artist_id;

-- Unique index doubles as the lookup index on artist_id and is required for
-- REFRESH MATERIALIZED VIEW CONCURRENTLY (used by the scheduled refresh job so
-- discovery queries are never blocked by a refresh).
CREATE UNIQUE INDEX artist_collaboration_artist_collaborator_idx
    ON artist_collaboration (artist_id, collaborator_artist_id);

REFRESH MATERIALIZED VIEW artist_collaboration;

-- Give every existing user a default weight for the new sorting attribute.
INSERT INTO user_track_score_weight
    (user_track_score_weight_multiplier, user_track_score_weight_code, meta_account_user_id)
SELECT 1, 'artist_collaboration', meta_account_user_id
FROM meta_account ma
WHERE NOT EXISTS (
    SELECT 1
    FROM user_track_score_weight w
    WHERE w.meta_account_user_id = ma.meta_account_user_id
      AND w.user_track_score_weight_code = 'artist_collaboration'
);

-- Refresh the collaboration graph once a day; the graph changes slowly and the
-- rebuild is heavier than the per-track score views, so it does not need the
-- 10-minute cadence those use.
INSERT INTO job (job_name)
VALUES ('updateArtistCollaborationScores')
ON CONFLICT (job_name) DO NOTHING;

INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '30 3 * * *'
FROM job
WHERE job_name = 'updateArtistCollaborationScores'
ON CONFLICT (job_id) DO NOTHING;
