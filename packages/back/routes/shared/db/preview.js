const sql = require('sql-template-strings')
const pg = require('../../../db/pg.js')

module.exports.queryPreviewDetails = previewId =>
  pg
    .queryRowsAsync(
      //language=PostgreSQL
      sql`
  SELECT store__track_preview_url AS url,
    store__track_preview_start_ms AS start_ms,
    store__track_preview_end_ms AS end_ms,
    store__track_store_id AS store_track_id
  FROM store__track_preview NATURAL JOIN store__track
  WHERE store__track_preview_id = ${previewId}
  `
    )
    .then(([details]) => details)
