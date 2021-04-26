const pg = require('../db/pg.js')
const sql = require('sql-template-strings')

module.exports.updateDateAddedScore = async () => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- updateDateAddedScore
    REFRESH MATERIALIZED VIEW track_date_added_score
    `
  )
}

module.exports.updateDateReleasedScore = async () => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`--updateDateReleasedScore
    REFRESH MATERIALIZED VIEW track_date_released_score
    `
  )
}
