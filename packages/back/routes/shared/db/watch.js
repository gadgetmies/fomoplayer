const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

module.exports.setPlaylistUpdated = async (playlistId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- setPlaylistUpdated UPDATE playlist
UPDATE playlist
SET
  playlist_last_update = NOW()
, playlist_fetch_failure_count = 0
, playlist_fetch_retry_after = NULL
WHERE
  playlist_id = ${playlistId}`,
  )

module.exports.setArtistUpdated = async (storeArtistId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- setArtistUpdated
UPDATE store__artist
SET
  store__artist_last_update = NOW()
, store__artist_fetch_failure_count = 0
, store__artist_fetch_retry_after = NULL
WHERE
  store__artist_id = ${storeArtistId}`,
  )

module.exports.setLabelUpdated = async (storeLabelId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`--setLabelUpdated
UPDATE store__label
SET
  store__label_last_update = NOW()
, store__label_fetch_failure_count = 0
, store__label_fetch_retry_after = NULL
WHERE
  store__label_id = ${storeLabelId}`,
  )

module.exports.setArtistMissing = async (storeArtistId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`--setArtistMissing
UPDATE store__artist
SET
  store__artist_missing = TRUE
WHERE
  store__artist_id = ${storeArtistId}`,
  )

module.exports.setLabelMissing = async (storeLabelId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`--setLabelMissing
UPDATE store__label
SET
  store__label_missing = TRUE
WHERE
  store__label_id = ${storeLabelId}`,
  )

// A failed fetch (other than a store-wide rate limit) postpones the entity's
// next attempt: 30 minutes after the first failure, doubling with each
// further failure, at most a day. setXUpdated clears it on the next success.
const FETCH_RETRY_BASE = '30 minutes'
const FETCH_RETRY_MAX = '24 hours'

module.exports.setPlaylistFetchFailed = async (playlistId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- setPlaylistFetchFailed
UPDATE playlist
SET
  playlist_fetch_failure_count = playlist_fetch_failure_count + 1
, playlist_fetch_retry_after   = NOW() + LEAST(${FETCH_RETRY_BASE}::INTERVAL * POWER(2, playlist_fetch_failure_count), ${FETCH_RETRY_MAX}::INTERVAL)
WHERE
  playlist_id = ${playlistId}`,
  )

module.exports.setArtistFetchFailed = async (storeArtistId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- setArtistFetchFailed
UPDATE store__artist
SET
  store__artist_fetch_failure_count = store__artist_fetch_failure_count + 1
, store__artist_fetch_retry_after   = NOW() + LEAST(${FETCH_RETRY_BASE}::INTERVAL * POWER(2, store__artist_fetch_failure_count), ${FETCH_RETRY_MAX}::INTERVAL)
WHERE
  store__artist_id = ${storeArtistId}`,
  )

module.exports.setLabelFetchFailed = async (storeLabelId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- setLabelFetchFailed
UPDATE store__label
SET
  store__label_fetch_failure_count = store__label_fetch_failure_count + 1
, store__label_fetch_retry_after   = NOW() + LEAST(${FETCH_RETRY_BASE}::INTERVAL * POWER(2, store__label_fetch_failure_count), ${FETCH_RETRY_MAX}::INTERVAL)
WHERE
  store__label_id = ${storeLabelId}`,
  )
