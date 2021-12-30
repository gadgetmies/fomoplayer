const sql = require('sql-template-strings')
const R = require('ramda')
const pg = require('../db/pg.js')
const { using } = require('bluebird')

module.exports.queryLongestPreviewForTrack = (id, format, skip) =>
  pg
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryLongestPreviewForTrack
SELECT
  store__track_preview_url AS url
, store__track_preview_id  AS "previewId"
FROM
  store__track_preview
  NATURAL JOIN
    store__track
  NATURAL JOIN
    store
WHERE
    track_id = ${id}
AND store__track_preview_format = ${format}
ORDER BY
  store__track_preview_end_ms - store__track_preview_start_ms DESC NULLS LAST
OFFSET ${skip} LIMIT 1;
`
    )
    .then(R.head)

module.exports.searchForArtistsAndLabels = query =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- searchForTracks
WITH
  query AS (SELECT websearch_to_tsquery('simple', unaccent(${query})) AS query)
SELECT
  id
, label
, type
, stores
FROM
  (SELECT
     artist_id             AS id
   , artist_name           AS label
   , 'artist'              AS type
   , ARRAY_AGG(LOWER(store_name)) AS stores
   FROM
     artist
     NATURAL JOIN store__artist
     NATURAL JOIN store
   GROUP BY
     artist_id, artist_name
   HAVING
       to_tsvector(
           'simple'
         , unaccent(
               artist_name)) @@ (
         SELECT
           query
         FROM query)) AS artists
UNION ALL
(SELECT
   label_id   AS id
 , label_name AS label
 , 'label'    AS type
 , ARRAY_AGG(LOWER(store_name))
 FROM
   label
   NATURAL JOIN store__label
   NATURAL JOIN store
 GROUP BY
   label_id, label_name
 HAVING
     to_tsvector(
         'simple'
       , unaccent(
             label_name)) @@ (
       SELECT
         query
       FROM query))`
  )

module.exports.queryCartDetailsByUuid = async uuid => {
  const [details] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- searchForTracks
SELECT cart_id AS "id", cart_is_public AS "isPublic"
FROM cart
WHERE cart_uuid = ${uuid}`
  )

  return details
}

module.exports.verifyEmail = async verificationCode => {
  await using(pg.getTransaction(), async tx => {
    const { rowCount } = await tx.queryAsync(
      // language=PostgreSQL
      sql`-- verifyEmail
      UPDATE meta_account_email
      SET meta_account_email_verified = TRUE
      WHERE meta_account_email_verification_code = ${verificationCode}
      `
    )

    if (rowCount !== 1) {
      if (rowCount === 0) {
        throw new Error(`Invalid verification code`)
      } else {
        logger.error(`Email verification would update multiple rows!`, { rowCount })
        throw new Error('Email verification failed')
      }
    }
  })
}
