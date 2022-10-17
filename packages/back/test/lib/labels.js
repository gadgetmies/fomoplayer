const sql = require('sql-template-strings')
const { pg } = require('./db')

module.exports.queryLabelsForTracks = async addedLabels =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
SELECT
    ARRAY_AGG(label_id) AS "labelIds"
FROM
    track
        NATURAL JOIN track__label
WHERE
    track_id = ANY (${addedLabels})
`
  )

module.exports.removeLabels = async labelIds =>
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
DELETE FROM label WHERE label_id = ANY(${labelIds})
`
  )
