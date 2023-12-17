const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

module.exports.setPlaylistUpdated = async playlistId =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- setPlaylistUpdated UPDATE playlist
UPDATE playlist
SET
  playlist_last_update = NOW()
WHERE
  playlist_id = ${playlistId}`
  )

module.exports.setArtistUpdated = async storeArtistId =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- setArtistUpdated
UPDATE store__artist
SET
  store__artist_last_update = NOW()
WHERE
  store__artist_id = ${storeArtistId}`
  )

module.exports.setLabelUpdated = async storeLabelId =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`--setLabelUpdated
UPDATE store__label
SET
  store__label_last_update = NOW()
WHERE
  store__label_id = ${storeLabelId}`
  )
