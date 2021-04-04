const sql = require('sql-template-strings')
const R = require('ramda')
const pg = require('../db/pg.js')

module.exports.getLongestPreviewForTrack = (id, format, skip) =>
  pg
    .queryRowsAsync(
      // language=PostgreSQL
      sql`
    SELECT store__track_id AS "storeTrackId" , lower(store_name) AS "storeCode"
    FROM
      store__track_preview NATURAL JOIN
      store__track  NATURAL JOIN
      store
    WHERE track_id = ${id} AND store__track_preview_format = ${format}
    ORDER BY store__track_preview_end_ms - store__track_preview_start_ms DESC NULLS LAST
    OFFSET ${skip}
    LIMIT 1;
    `
    )
    .then(R.head)
