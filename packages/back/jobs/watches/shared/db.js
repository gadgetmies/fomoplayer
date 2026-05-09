const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

const DEFAULT_BATCH_SIZE = 20
const DEFAULT_REFRESH_INTERVAL = '6 hours'

module.exports.getPlaylistFollowDetails = async (
  storeUrl,
  { batchSize = DEFAULT_BATCH_SIZE, refreshInterval = DEFAULT_REFRESH_INTERVAL } = {},
) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getPlaylistFollowDetails
SELECT
  playlist_id                  AS "playlistId"
, playlist_store_id            AS "playlistStoreId"
, store_playlist_type_store_id AS type
, playlist_last_update         AS "lastUpdate"
FROM
  user__playlist_watch
  NATURAL JOIN playlist
  NATURAL JOIN store_playlist_type
  NATURAL JOIN store
WHERE
    store_url = ${storeUrl}
AND (playlist_last_update IS NULL OR playlist_last_update + (${refreshInterval})::INTERVAL < NOW())
ORDER BY
  playlist_last_update NULLS FIRST
LIMIT ${batchSize}
`,
  )

module.exports.getArtistFollowDetails = async (
  storeUrl,
  { batchSize = DEFAULT_BATCH_SIZE, refreshInterval = DEFAULT_REFRESH_INTERVAL } = {},
) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getArtistFollowDetails
SELECT
  store__artist_id           AS "storeArtistId"
, store__artist_store_id     AS "artistStoreId"
, store__artist_url          AS url
, store__artist_last_update  AS "lastUpdate"
FROM
  store__artist_watch__user
  NATURAL JOIN store__artist_watch
  NATURAL JOIN store__artist
  NATURAL JOIN store
WHERE
    store_url = ${storeUrl} AND
    store__artist_ignored IS FALSE
AND store__artist_missing IS FALSE
AND store__artist_url IS NOT NULL
AND (store__artist_last_update IS NULL OR store__artist_last_update + (${refreshInterval})::INTERVAL < NOW())
ORDER BY
  store__artist_last_update NULLS FIRST
LIMIT ${batchSize}
`,
  )

module.exports.getLabelFollowDetails = async (
  storeUrl,
  { batchSize = DEFAULT_BATCH_SIZE, refreshInterval = DEFAULT_REFRESH_INTERVAL } = {},
) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getLabelFollowDetails
SELECT
  store__label_id          AS "storeLabelId"
, store__label_store_id    AS "labelStoreId"
, store__label_url         AS url
, store__label_last_update AS "lastUpdate"
FROM
  store__label_watch__user
  NATURAL JOIN store__label_watch
  NATURAL JOIN store__label
  NATURAL JOIN store
WHERE
    store_url = ${storeUrl} AND
    store__label_ignored IS FALSE
AND store__label_missing IS FALSE
AND (store__label_last_update IS NULL OR store__label_last_update + (${refreshInterval})::INTERVAL < NOW())
ORDER BY
  store__label_last_update NULLS FIRST
LIMIT ${batchSize}
`,
  )

module.exports.insertSource = async (details) => {
  const [{ source_id }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- insertSource
INSERT INTO source
  (source_details)
VALUES
  (${details})
RETURNING source_id
`,
  )
  return source_id
}

module.exports.updateSourceDetails = async (sourceId, patch) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- updateSourceDetails
UPDATE source
   SET source_details = source_details || ${JSON.stringify(patch)}::JSONB
 WHERE source_id = ${sourceId}
`,
  )

module.exports.DEFAULT_BATCH_SIZE = DEFAULT_BATCH_SIZE
module.exports.DEFAULT_REFRESH_INTERVAL = DEFAULT_REFRESH_INTERVAL
