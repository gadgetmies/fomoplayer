const sql = require('sql-template-strings')
const { pg } = require('./db')

module.exports.removeSources = async sourceIds =>
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
DELETE from source WHERE source_id = ANY(${sourceIds})
`
  )
