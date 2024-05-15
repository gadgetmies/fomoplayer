const { using } = require('bluebird')
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const logger = require('fomoplayer_shared').logger(__filename)

module.exports.queryEntityDetails = async (entityType, entityId) => {
  return using(pg.getTransaction(), async tx => {
    let query = sql`
--queryNameForEntity
SELECT `
    query.append(`
    ${tx.escapeIdentifier(`${entityType}_id`)} as id,
    ${tx.escapeIdentifier(`${entityType}_name`)} as name,
    JSON_AGG(JSON_BUILD_OBJECT(
      'store', JSON_BUILD_OBJECT(
        'id', store_id,
        'name', store_name
      ),
      'id', ${tx.escapeIdentifier(`store__${entityType}_id`)},
      'storeId', ${tx.escapeIdentifier(`store__${entityType}_store_id`)},
      'url', ${tx.escapeIdentifier(`store__${entityType}_url`)}
    )) AS stores
FROM ${tx.escapeIdentifier(entityType)}
NATURAL JOIN ${tx.escapeIdentifier(`store__${entityType}`)}
NATURAL JOIN store
WHERE ${tx.escapeIdentifier(`${entityType}_id`)} = ${entityId}
GROUP BY 1, 2
`)
    const res = await tx.queryRowsAsync(query)
    logger.info(`Results for queryNameForEntity: ${res}`)
    const [details] = res
    return details
  })
}
