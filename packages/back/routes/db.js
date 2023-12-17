const sql = require('sql-template-strings')
const R = require('ramda')
const pg = require('fomoplayer_shared').db.pg
const { using } = require('bluebird')
const { cryptoKey } = require('../config')
const logger = require('fomoplayer_shared').logger(__filename)

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
    sql`-- searchForArtistsAndLabels
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
    sql`-- queryCartDetailsByUuid
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

module.exports.upsertUserAuthorizationTokens = async (userId, storeName, accessToken, refreshToken, expires) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- setUserAuthorizationTokens
INSERT
INTO
    user__store_authorization ( meta_account_user_id, store_id, user__store_authorization_access_token
                              , user__store_authorization_refresh_token, user__store_authorization_expires)
SELECT
    ${userId}
  , store_id
  , pgp_sym_encrypt(${accessToken}, ${cryptoKey})
  , pgp_sym_encrypt(${refreshToken}, ${cryptoKey})
  , NOW() + ${`${expires} seconds`}::INTERVAL
FROM
    store
WHERE
    store_name = ${storeName}
ON CONFLICT ON CONSTRAINT user__store_authorization_meta_account_user_id_store_id_key
    DO UPDATE SET
                  user__store_authorization_access_token  = EXCLUDED.user__store_authorization_access_token
                , user__store_authorization_refresh_token = EXCLUDED.user__store_authorization_refresh_token
                , user__store_authorization_expires       = EXCLUDED.user__store_authorization_expires`
  )
}

module.exports.queryAuthorization = async userId => {
  const res = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryAuthorization
SELECT
    pgp_sym_decrypt(user__store_authorization_access_token, ${cryptoKey}) AS access_token,
    pgp_sym_decrypt(user__store_authorization_refresh_token, ${cryptoKey}) AS refresh_token,
    user__store_authorization_expires as expires
FROM
    user__store_authorization
WHERE
      meta_account_user_id = ${userId}
  AND store_id = (SELECT store_id FROM store WHERE store_name = 'Spotify')
    `
  )

  if (res.length === 0) {
    throw new Error('Cannot synchronise the cart as user has not granted Spotify access')
  } else {
    if (res.length > 1) {
      logger.error('User has multiple active Spotify authorizations')
    }

    return res[0]
  }
}
