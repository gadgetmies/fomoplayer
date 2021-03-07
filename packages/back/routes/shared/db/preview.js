const sql = require('sql-template-strings')
const pg = require('../../../db/pg.js')

module.exports.queryPreviewUrl = (id, format, bpStoreId) =>
  pg
    .queryRowsAsync(
      //language=PostgreSQL
      sql`
  SELECT store__track_preview_url
  FROM store__track_preview NATURAL JOIN store__track
  WHERE store__track_id = ${id} AND store__track_preview_format = ${format} AND store_id = ${bpStoreId}
  `
    )
    .then(([{ store__track_preview_url }]) => store__track_preview_url)
