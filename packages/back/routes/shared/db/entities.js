const BPromise = require('bluebird')
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const logger = require('fomoplayer_shared').logger(__filename)

const ENTITY_NAME_COLUMN = {
  artist: 'artist_name',
  label: 'label_name',
  release: 'release_name',
  track: 'track_title',
}

module.exports.queryEntityName = async (entityType, entityId) => {
  const nameColumn = ENTITY_NAME_COLUMN[entityType]
  if (!nameColumn) throw new Error(`Unsupported entity type: ${entityType}`)
  const parsedId = parseInt(entityId, 10)
  if (Number.isNaN(parsedId) || parsedId <= 0) throw new Error('Invalid entity id')
  const idColumn = `${entityType}_id`
  return BPromise.using(pg.getTransaction(), async (tx) => {
    const query = sql`SELECT `
    query.append(`${tx.escapeIdentifier(idColumn)} AS id, ${tx.escapeIdentifier(nameColumn)} AS name FROM ${tx.escapeIdentifier(entityType)} WHERE ${tx.escapeIdentifier(idColumn)} = `)
    query.append(sql`${parsedId}`)
    const [row] = await tx.queryRowsAsync(query)
    return row || null
  })
}

const ENTITY_SEARCH_CONFIG = {
  artist: { table: 'artist', idColumn: 'artist_id', nameColumn: 'artist_name' },
  label: { table: 'label', idColumn: 'label_id', nameColumn: 'label_name' },
  release: { table: 'release', idColumn: 'release_id', nameColumn: 'release_name' },
  track: { table: 'track', idColumn: 'track_id', nameColumn: 'track_title' },
}

module.exports.searchEntitiesByName = async (entityType, query, limit = 10) => {
  const cfg = ENTITY_SEARCH_CONFIG[entityType]
  if (!cfg) throw new Error(`Unsupported entity type: ${entityType}`)
  const trimmed = (query || '').trim()
  if (!trimmed) return []
  return BPromise.using(pg.getTransaction(), async (tx) => {
    const sqlQuery = sql`SELECT `
    sqlQuery.append(
      `${tx.escapeIdentifier(cfg.idColumn)} AS id, ${tx.escapeIdentifier(cfg.nameColumn)} AS name FROM ${tx.escapeIdentifier(cfg.table)} WHERE to_tsvector('simple', unaccent(${tx.escapeIdentifier(cfg.nameColumn)})) @@ websearch_to_tsquery('simple', unaccent(`,
    )
    sqlQuery.append(sql`${trimmed}`)
    sqlQuery.append(`)) ORDER BY LENGTH(${tx.escapeIdentifier(cfg.nameColumn)}) ASC LIMIT `)
    sqlQuery.append(sql`${limit}`)
    return tx.queryRowsAsync(sqlQuery)
  })
}

module.exports.queryEntityDetails = async (entityType, entityId) => {
  const parsedId = parseInt(entityId, 10)
  if (Number.isNaN(parsedId) || parsedId <= 0) throw new Error('Invalid entity id')
  return BPromise.using(pg.getTransaction(), async (tx) => {
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
WHERE `)
    query.append(`${tx.escapeIdentifier(`${entityType}_id`)} = `)
    query.append(sql`${parsedId}
GROUP BY 1, 2
`)
    const res = await tx.queryRowsAsync(query)
    logger.info(`Results for queryNameForEntity`, res)
    const [details] = res
    return details
  })
}
