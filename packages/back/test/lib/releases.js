const sql = require('sql-template-strings')
const { pg } = require('./db')

module.exports.queryReleasesForTracks = async (addedTracks) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
SELECT
    ARRAY_AGG(release_id) AS "releaseIds"
FROM
    track
        NATURAL JOIN release__track
WHERE
    track_id = ANY (${addedTracks})
`,
  )

module.exports.removeReleases = async (releaseIds) => {
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
DELETE FROM store__release WHERE release_id = ANY(${releaseIds})
`,
  )
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
DELETE FROM release WHERE release_id = ANY(${releaseIds})
`,
  )
}
