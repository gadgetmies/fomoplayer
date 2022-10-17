const sql = require('sql-template-strings')
const { pg } = require('./db')

module.exports.queryArtistsForTracks = async addedTracks =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
SELECT
    ARRAY_AGG(artist_id) AS "artistIds"
FROM
    track
        NATURAL JOIN track__artist
WHERE
    track_id = ANY (${addedTracks})
`
  )

module.exports.removeArtists = async artistIds =>
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
DELETE FROM artist WHERE artist_id = ANY(${artistIds})
`
  )
