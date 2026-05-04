const pg = require('fomoplayer_shared').db.pg
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
      `,
  )
  return track_ids
}

module.exports.queryTrackDetails = async (trackIds) =>
  await pg.queryRowsAsync(
    //language=PostgreSQL
    sql`-- queryTrackDetails
SELECT * FROM track_details(${trackIds})
    `,
  )

module.exports.queryTrackIdMappingForStoreUrl = async (storeUrl, storeTrackIds) => {
  if (!storeTrackIds || storeTrackIds.length === 0) return {}
  const ids = storeTrackIds.map(String)
  const rows = await pg.queryRowsAsync(
    //language=PostgreSQL
    sql`-- queryTrackIdMappingForStoreUrl
      SELECT track_id, store__track_store_id AS store_track_id
      FROM
        track
        NATURAL JOIN store__track
        NATURAL JOIN store
      WHERE store_url = ${storeUrl}
        AND store__track_store_id = ANY (${ids})
    `,
  )
  return rows.reduce((acc, { store_track_id, track_id }) => {
    acc[store_track_id] = track_id
    return acc
  }, {})
}

module.exports.queryStoredTracksForUrls = async (urls) => {
  const [{ track_details }] = await pg.queryRowsAsync(
    //language=PostgreSQL
    sql`-- queryStoredTracksForUrls
    WITH tracks AS (SELECT JSON_AGG(JSON_BUILD_OBJECT('id', track_id, 'url', store__track_url)) AS track_details
                    FROM
                      track
                      NATURAL JOIN store__track
                    WHERE store__track_url = ANY (${urls}))
    SELECT CASE WHEN track_details IS NULL THEN '[]'::JSON ELSE track_details END AS track_details
    FROM
      tracks
    `,
  )
  return track_details
}
