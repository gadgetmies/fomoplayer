const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

module.exports.queryAlbumUrl = (storeId, storeTrackId) =>
  pg
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryAlbumUrl
SELECT
  store__release_url
FROM
  store__release
  NATURAL JOIN release
  NATURAL JOIN release__track
  NATURAL JOIN store__track
WHERE
    store__track_store_id = ${storeTrackId}::TEXT
AND store_id = ${storeId}
    `,
    )
    .then(([{ store__release_url }]) => store__release_url)

module.exports.queryTrackStoreId = (trackId) =>
  pg
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryTrackStoreId
SELECT
  store__track_store_id
FROM store__track
WHERE
  store__track_id = ${trackId}
`,
    )
    .then(([{ store__track_store_id }]) => store__track_store_id)
