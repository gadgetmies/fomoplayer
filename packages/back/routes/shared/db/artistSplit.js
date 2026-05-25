const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg

// Cache of artists whose name looks like it bundles several artists, populated
// by detectArtistSplitCandidates and read by the admin UI. Detection only;
// splitting is admin-driven so legitimate compound names (e.g. "Camo &
// Krooked") are never split blindly.

// Artists to (re-)scan: everything except those already dismissed or split, so
// a re-run does not resurrect a decision an admin already made.
module.exports.getArtistsForSplitScan = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getArtistsForSplitScan
SELECT a.artist_id   AS "artistId"
     , a.artist_name AS name
FROM artist a
WHERE NOT EXISTS (SELECT 1
                  FROM artist_split_candidate c
                  WHERE c.artist_id = a.artist_id
                    AND c.artist_split_candidate_status IN ('ignored', 'split'))`,
  )

module.exports.flagArtistSplitCandidate = async ({ artistId, name, suggestions }) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- flagArtistSplitCandidate
INSERT INTO artist_split_candidate
  (artist_id, artist_split_candidate_name, artist_split_candidate_suggestions, artist_split_candidate_checked_at)
VALUES (${artistId}, ${name}, ${JSON.stringify(suggestions)}::jsonb, NOW())
ON CONFLICT (artist_id) DO UPDATE
  SET artist_split_candidate_name        = EXCLUDED.artist_split_candidate_name
    , artist_split_candidate_suggestions = EXCLUDED.artist_split_candidate_suggestions
    , artist_split_candidate_checked_at  = NOW()
  WHERE artist_split_candidate.artist_split_candidate_status = 'new'`,
  )

// status='new' candidates joined to their (current) artist name, with a live
// track count so the admin sees how much a split would touch.
module.exports.getArtistSplitCandidates = async () => {
  const rows = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getArtistSplitCandidates
SELECT c.artist_id                          AS id
     , a.artist_name                        AS name
     , c.artist_split_candidate_name        AS "detectedName"
     , c.artist_split_candidate_suggestions AS suggestions
     , (SELECT COUNT(DISTINCT track_id) FROM track__artist ta WHERE ta.artist_id = c.artist_id) AS "trackCount"
FROM
  artist_split_candidate c
  JOIN artist a ON a.artist_id = c.artist_id
WHERE c.artist_split_candidate_status = 'new'
ORDER BY a.artist_name ASC`,
  )
  return rows.map((row) => ({ ...row, trackCount: Number(row.trackCount) }))
}

module.exports.ignoreArtistSplitCandidate = async (artistId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- ignoreArtistSplitCandidate
UPDATE artist_split_candidate
SET artist_split_candidate_status = 'ignored'
WHERE artist_id = ${artistId}`,
  )

// Mark a candidate resolved when its source artist is kept (could not be
// retired). When the source is deleted the row is removed via ON DELETE CASCADE
// instead.
module.exports.markArtistSplitCandidateSplit = async (queryable, artistId) =>
  queryable.queryAsync(
    // language=PostgreSQL
    sql`-- markArtistSplitCandidateSplit
UPDATE artist_split_candidate
SET artist_split_candidate_status = 'split'
WHERE artist_id = ${artistId}`,
  )
