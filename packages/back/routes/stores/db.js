const pg = require('../../db/pg')
const sql = require('sql-template-strings')

module.exports.queryStores = () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryStores
SELECT store_name AS "storeName", store_id AS "id", store_purchase_available AS "purchaseAvailable"
FROM store
`
  )
