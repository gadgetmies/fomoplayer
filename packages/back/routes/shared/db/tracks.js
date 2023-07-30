const pg = require('../../../db/pg.js')
const sql = require('sql-template-strings')

module.exports.queryTracksForStoreIds = async (storeName, storeTrackIds) => {
  const [{ track_ids }] = await pg.queryRowsAsync(
    //language=PostgreSQL
    sql`-- queryTracksForStoreIds
SELECT
    ARRAY_AGG(track_id)
FROM
    track
        NATURAL JOIN store__track
        NATURAL JOIN store
WHERE
      store_name = ${storeName}
  AND store__track_store_id = ANY (${storeTrackIds}) 
      `
  )
  return track_ids
}

module.exports.queryTrackDetails = async trackIds =>
  await pg.queryRowsAsync(
    //language=PostgreSQL
    sql`-- queryTrackDetails
SELECT * FROM track_details(${trackIds})
    `
  )
