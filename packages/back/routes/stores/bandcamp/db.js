const pg = require('../../../db/pg.js')
const R = require('ramda')
const sql = require('sql-template-strings')

module.exports.getStoreId = () =>
  pg
    .queryRowsAsync(
      //language=PostgreSQL
      sql` --getStoreId
SELECT store_id
  FROM store
  WHERE store_name = 'Bandcamp'`
    )
    .then(([{ store_id }]) => store_id)

module.exports.queryAlbumUrl = (storeId, storeTrackId) =>
  pg
    .queryRowsAsync(
      sql`
      SELECT store__release_url
      FROM store__release
      NATURAL JOIN release
      NATURAL JOIN release__track
      NATURAL JOIN store__track
      WHERE
        store__track_id = ${storeTrackId} AND
        store_id = ${storeId}
    `
    )
    .then(([{ store__release_url }]) => store__release_url)

module.exports.queryTrackStoreId = trackId =>
  pg
    .queryRowsAsync(
      sql`
  SELECT store__track_store_id FROM store__track WHERE store__track_id = ${trackId}
  `
    )
    .then(([{ store__track_store_id }]) => store__track_store_id)
