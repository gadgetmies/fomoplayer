const sql = require('sql-template-strings')
const logger = require('fomoplayer_shared').logger(__filename)

module.exports.queryLabelForRelease = async (tx, releaseId) => {
  const labelIds = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryLabelForRelease
SELECT DISTINCT
    label_id AS id
FROM
    release
        NATURAL JOIN release__track
        NATURAL JOIN track__label
WHERE
    release_id = ${releaseId}
      `
    )
    .map(({ id }) => id)

  if (labelIds.length === 0) {
    logger.warn(`Label not found for release: ${releaseId}`)
  }
  if (labelIds.length > 1) {
    logger.debug(`Multiple (${labelIds.length}) labels found for release: ${releaseId}`)
  }

  return labelIds[0]?.id
}
