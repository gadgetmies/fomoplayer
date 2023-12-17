const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

module.exports.getPlaylistFollowDetails = async storeUrl =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getPlaylistFollowDetails
SELECT
  playlist_id                  AS "playlistId"
, playlist_store_id            AS "playlistStoreId"
, store_playlist_type_store_id AS type
FROM
  user__playlist_watch
  NATURAL JOIN playlist
  NATURAL JOIN store_playlist_type
  NATURAL JOIN store
WHERE
    store_url = ${storeUrl}
AND (playlist_last_update IS NULL OR playlist_last_update + INTERVAL '6 hours' < NOW())
ORDER BY
  playlist_last_update NULLS FIRST
LIMIT 20
`
  )

module.exports.getArtistFollowDetails = async storeUrl =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getArtistFollowDetails
SELECT
  store__artist_id       AS "storeArtistId"
, store__artist_store_id AS "artistStoreId"
, store__artist_url      AS url
FROM
  store__artist_watch__user
  NATURAL JOIN store__artist_watch
  NATURAL JOIN store__artist
  NATURAL JOIN store
WHERE
    store_url = ${storeUrl} AND
    store__artist_ignored IS FALSE
AND store__artist_url IS NOT NULL
AND (store__artist_last_update IS NULL OR store__artist_last_update + INTERVAL '6 hours' < NOW())
ORDER BY
  store__artist_last_update NULLS FIRST
LIMIT 20
`
  )

module.exports.getLabelFollowDetails = async storeUrl =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getLabelFollowDetails
SELECT
  store__label_id       AS "storeLabelId"
, store__label_store_id AS "labelStoreId"
, store__label_url      AS url
FROM
  store__label_watch__user
  NATURAL JOIN store__label_watch
  NATURAL JOIN store__label
  NATURAL JOIN store
WHERE
    store_url = ${storeUrl} AND
    store__label_ignored IS FALSE
AND (store__label_last_update IS NULL OR store__label_last_update + INTERVAL '6 hours' < NOW())
ORDER BY
  store__label_last_update NULLS FIRST
LIMIT 20
`
  )

module.exports.insertSource = async details => {
  const [{ source_id }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- insertSource
INSERT INTO source
  (source_details)
VALUES
  (${details})
RETURNING source_id
`
  )
  return source_id
}
