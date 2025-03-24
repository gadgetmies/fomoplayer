const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

module.exports.queryStores = (store = null) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryStores
    SELECT store_name AS "storeName"
         , store_id AS "id"
         , store_purchase_available AS "purchaseAvailable"
         , store_search_url AS "searchUrl"
    FROM
      store
    WHERE ${store} :: TEXT IS NULL OR LOWER(store_name) = ${store}
    `,
  )
