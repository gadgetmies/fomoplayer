const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg

// Cache of artists whose name was polluted by track-title or version
// metadata at import time, populated by detectArtistNameIssues and read by
// the admin UI. Detection only; the repair is admin-driven so a flag is a
// suggestion, not a rewrite.

// Artists to (re-)scan: everything except those already dismissed or
// repaired, so a re-run does not resurrect a decision an admin already
// made. A successful rename deletes the row outright (so a later
// re-pollution gets flagged again); a merge or delete drops the artist
// itself and cascades the row away.
module.exports.getArtistsForNameIssueScan = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getArtistsForNameIssueScan
SELECT a.artist_id   AS "artistId"
     , a.artist_name AS name
FROM artist a
WHERE NOT EXISTS (SELECT 1
                  FROM artist_name_issue i
                  WHERE i.artist_id = a.artist_id
                    AND i.artist_name_issue_status IN ('ignored', 'fixed'))`,
  )

// Upsert a flag for an artist. The WHERE on the conflict clause keeps
// already-ignored/fixed rows stable while still refreshing the captured
// kinds and suggestion for rows still 'new'.
module.exports.flagArtistNameIssue = async ({ artistId, name, kinds, suggestedName }) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- flagArtistNameIssue
INSERT INTO artist_name_issue
  (artist_id, artist_name_issue_name, artist_name_issue_kinds, artist_name_issue_suggested,
   artist_name_issue_checked_at)
VALUES (${artistId}, ${name}, ${JSON.stringify(kinds)}::jsonb, ${suggestedName}, NOW())
ON CONFLICT (artist_id) DO UPDATE
  SET artist_name_issue_name       = EXCLUDED.artist_name_issue_name
    , artist_name_issue_kinds      = EXCLUDED.artist_name_issue_kinds
    , artist_name_issue_suggested  = EXCLUDED.artist_name_issue_suggested
    , artist_name_issue_checked_at = NOW()
  WHERE artist_name_issue.artist_name_issue_status = 'new'`,
  )

// status='new' candidates joined to their (current) artist name, with a
// live track count so the admin sees how much a rename / merge / delete
// would touch.
module.exports.getArtistNameIssues = async () => {
  const rows = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getArtistNameIssues
SELECT i.artist_id                       AS id
     , a.artist_name                     AS name
     , i.artist_name_issue_kinds         AS kinds
     , i.artist_name_issue_suggested     AS "suggestedName"
     , (SELECT COUNT(DISTINCT track_id) FROM track__artist ta WHERE ta.artist_id = i.artist_id) AS "trackCount"
FROM
  artist_name_issue i
  JOIN artist a ON a.artist_id = i.artist_id
WHERE i.artist_name_issue_status = 'new'
ORDER BY a.artist_name ASC`,
  )
  return rows.map((row) => ({ ...row, trackCount: Number(row.trackCount) }))
}

module.exports.ignoreArtistNameIssue = async (artistId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- ignoreArtistNameIssue
UPDATE artist_name_issue
SET artist_name_issue_status = 'ignored'
WHERE artist_id = ${artistId}`,
  )

// Drop the row entirely on a successful rename so a later re-pollution of
// the same artist (importers can re-create the bad name) gets flagged
// again on the next scan.
module.exports.clearArtistNameIssue = async (queryable, artistId) =>
  queryable.queryAsync(
    // language=PostgreSQL
    sql`-- clearArtistNameIssue
DELETE FROM artist_name_issue WHERE artist_id = ${artistId}`,
  )
