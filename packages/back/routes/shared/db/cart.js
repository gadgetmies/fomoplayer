const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

module.exports.queryCartOwner = async cartId => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryCartOwner
SELECT
  meta_account_user_id AS "ownerUserId"
FROM cart
WHERE
  cart_id = ${cartId}
`
  )
}

module.exports.queryUserCartDetails = async userId =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryUserCartDetails
    WITH cart_store_details AS (SELECT cart_id
                                     , JSON_AGG(JSON_BUILD_OBJECT(
          'id', cart__store_cart_store_id,
          'url', cart__store_cart_url,
          'store_name', store_name,
          'version_id', cart__store_store_version_id
                                                )) AS store_details
                                FROM
                                  cart
                                  NATURAL JOIN cart__store
                                  NATURAL JOIN store
                                WHERE meta_account_user_id = ${userId}
                                GROUP BY 1)
       , track_counts AS (SELECT cart_id, COUNT(track_id) AS track_count
                          FROM
                            cart
                            NATURAL JOIN track__cart
                          GROUP BY 1)
    SELECT cart_id                                                                AS id
         , cart_name                                                              AS name
         , COALESCE(cart_is_default, FALSE)                                       AS is_default
         , cart_is_public                                                         AS is_public
         , COALESCE(cart_is_purchased, FALSE)                                     AS is_purchased
         , cart_uuid                                                              AS uuid
         , cart_deleted                                                           AS deleted
         , CASE WHEN store_details IS NULL THEN '[]'::JSON ELSE store_details END AS store_details
         , track_count                                                            AS track_count
    FROM
      cart
      NATURAL LEFT JOIN cart_store_details
      NATURAL LEFT JOIN track_counts
    WHERE meta_account_user_id = ${userId}
    ORDER BY cart_is_default, cart_is_purchased, cart_name
    `
  )

module.exports.queryUserCartDetailsWithTracks = async userId =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryUserCartDetailsWithTracks
    WITH cart_details AS (SELECT cart_id
                               , cart_name
                               , cart_is_default
                               , cart_is_public
                               , cart_is_purchased
                               , cart_uuid
                               , cart_deleted
                          FROM
                            cart
                          WHERE meta_account_user_id = ${userId})
       , cart_tracks AS (SELECT *
                         FROM
                           (SELECT ROW_NUMBER() OVER (PARTITION BY cart_id) AS r, t.*
                            FROM
                              (SELECT cart_id, track_id, track__cart_added
                               FROM
                                 track__cart
                                 NATURAL JOIN cart_details
                               GROUP BY 1, 2, track__cart_added
                               ORDER BY track__cart_added DESC) t) x
                         WHERE x.r < 100)
       , td AS (SELECT DISTINCT ON (track_id)*, user__track_heard AS heard, track_id AS id
                FROM
                  track_details
                  NATURAL LEFT JOIN user__track
                WHERE meta_account_user_id = ${userId}
                  AND track_id IN (cart_tracks))
       , tracks AS (SELECT cart_id, JSON_AGG(td ORDER BY track__cart_added DESC) AS tracks
                    FROM
                      cart_tracks
                      NATURAL JOIN td

                    GROUP BY 1)
       , cart_store_details AS (SELECT cart_id
                                     , JSON_AGG(JSON_BUILD_OBJECT(
          'id', cart__store_cart_store_id,
          'url', cart__store_cart_url,
          'store_name', store_name,
          'version_id', cart__store_store_version_id
                                                )) AS store_details
                                FROM
                                  cart_details
                                  NATURAL JOIN cart__store
                                  NATURAL JOIN store
                                GROUP BY 1)
    SELECT cart_id                                                                AS id
         , cart_name                                                              AS name
         , cart_is_default IS NOT NULL                                            AS is_default
         , cart_is_public                                                         AS is_public
         , cart_is_purchased IS NOT NULL                                          AS is_purchased
         , cart_uuid                                                              AS uuid
         , cart_deleted                                                           AS deleted
         , CASE WHEN tracks.tracks IS NULL THEN '[]'::JSON ELSE tracks.tracks END AS tracks
         , CASE WHEN store_details IS NULL THEN '[]'::JSON ELSE store_details END AS store_details
    FROM
      cart_details
      NATURAL LEFT JOIN
        tracks
      NATURAL LEFT JOIN
        cart_store_details
    ORDER BY cart_is_default, cart_is_purchased, cart_name
    `
  )

module.exports.queryCartDetails = async (cartId, tracksFilter) => {
  const query =
    // language=PostgreSQL
    sql`--queryCartDetails
    WITH cart_details AS (SELECT cart_id
                               , cart_name
                               , cart_is_default
                               , cart_is_public
                               , cart_is_purchased
                               , cart_uuid
                               , cart_deleted
                               , COUNT(track_id) AS track_count
                          FROM
                            cart
                            NATURAL LEFT JOIN track__cart
                          WHERE cart_id = ${cartId}
                          GROUP BY 1, 2, 3, 4, 5, 6, 7)
       , cart_store_details AS
      (SELECT cart_id
            , JSON_AGG(
            JSON_BUILD_OBJECT(
                'id', cart__store_cart_store_id,
                'url', cart__store_cart_url,
                'store_name', store_name,
                'version_id', cart__store_store_version_id
            )) AS store_details
       FROM
         cart_details
         NATURAL JOIN cart__store
         NATURAL JOIN store
       GROUP BY 1)
       , cart_tracks AS (SELECT track_id
                              , track_details
                         FROM
                           track__cart
                           NATURAL JOIN track_details
                         WHERE cart_id = ${cartId}
                         ORDER BY track__cart_added DESC
                         LIMIT 400)
       , td AS (SELECT DISTINCT ON (track_id) td.*
                                            , user__track_heard AS heard
                                            , track_id          AS id
                                            , cart_id
                FROM
                  cart_tracks
                  NATURAL JOIN JSON_TO_RECORD(track_details) AS td ( track_id INT, title TEXT, duration INT, added DATE
                                                                   , artists JSON, version TEXT, labels JSON
                                                                   , remixers JSON, releases JSON, keys JSON
                                                                   , previews JSON, stores JSON, released DATE
                                                                   , published DATE)
                  NATURAL JOIN track__cart
                  NATURAL LEFT JOIN user__track
                WHERE cart_id = ${cartId}`

  if (tracksFilter?.since) {
    query.append(`
    AND
      track__cart_added > '${tracksFilter.since}'
    `)
  }

  query.append(sql`
)
       , tracks AS (SELECT JSON_AGG(td ORDER BY track__cart_added DESC) AS tracks
                    FROM
                      td
                      NATURAL JOIN track__cart)
    SELECT cart_id                                                                AS id
         , cart_name                                                              AS name
         , cart_is_default IS NOT NULL                                            AS is_default
         , cart_is_public                                                         AS is_public
         , cart_is_purchased IS NOT NULL                                          AS is_purchased
         , cart_uuid                                                              AS uuid
         , cart_deleted                                                           AS deleted
         , track_count                                                            AS track_count
         , CASE WHEN tracks.tracks IS NULL THEN '[]'::JSON ELSE tracks.tracks END AS tracks
         , CASE WHEN store_details IS NULL THEN '[]'::JSON ELSE store_details END AS store_details
    FROM
      cart_details
      NATURAL JOIN tracks
      NATURAL LEFT JOIN cart_store_details
    ORDER BY cart_is_default, cart_is_purchased, cart_name
    `)

  const [details] = await pg.queryRowsAsync(query)

  return details
}

module.exports.deleteCart = async cartId =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- deleteCart
    UPDATE cart
    SET cart_deleted = NOW()
    WHERE cart_id = ${cartId}
    `
  )

module.exports.updateCartProperties = async (tx, cartId, { name, is_public }) => {
  await tx.queryAsync(
    // language=PostgreSQL
    sql`---updateCartProperties
    UPDATE cart
    SET
        cart_name      = COALESCE(${name} :: TEXT, cart_name)
      , cart_is_public = COALESCE(${is_public}, cart_is_public)
    WHERE
        cart_id = ${cartId}
    `
  )
}

module.exports.queryDefaultCartId = async userId => {
  const [{ id }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryDefaultCartId
SELECT
  cart_id AS id
FROM cart
WHERE
    cart_is_default = TRUE
AND meta_account_user_id = ${userId}
`
  )
  return id
}

module.exports.insertCart = async (userId, name) => {
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--insertCart
INSERT INTO cart
  (cart_name, meta_account_user_id)
VALUES
  (${name}, ${userId})
`
  )

  const [cart] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`SELECT
    cart_id   AS id
  , cart_name AS name
FROM
    cart
WHERE
      cart_name = ${name}
  AND meta_account_user_id = ${userId}`
  )

  return cart
}

module.exports.insertTracksToCart = async (cartId, trackIds) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--insertTracksToCart
INSERT INTO track__cart
  (cart_id, track_id)
SELECT
  ${cartId}
, track_id
FROM unnest(${trackIds}:: INTEGER[]) AS track_id
ON CONFLICT ON CONSTRAINT track__cart_cart_id_track_id_key DO NOTHING`
  )

module.exports.deleteTracksFromCart = async (cartId, trackIds) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--deleteTracksFromCart
DELETE
FROM track__cart
WHERE
    track_id = ANY (${trackIds})
AND cart_id = ${cartId}
`
  )

module.exports.queryCartStoreDetails = async cartId =>
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryCartStoreDetails
  SELECT
      store_id AS "storeId",
      store_name AS "storeName",
      cart__store_cart_store_id AS "cartStoreId"
    , cart__store_store_version_id AS "cartVersionId"
  FROM
      cart__store NATURAL JOIN store
  WHERE
      cart_id = ${cartId}
  `
  )

module.exports.insertCartStoreDetails = async (cartId, storeName, cartStoreId, cartStoreUrl, cartStoreVersionId) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- insertCartStoreDetails
INSERT
INTO
    cart__store (cart_id, store_id, cart__store_cart_store_id, cart__store_cart_url, cart__store_store_version_id)
SELECT
    ${cartId}
  , store_id
  , ${cartStoreId}
  , ${cartStoreUrl}
  , ${cartStoreVersionId}
FROM
    store
WHERE
    store_name = ${storeName}
    `
  )
}

module.exports.deleteUserCartStoreDetails = async (userId, storeName) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- deleteUserCartStoreDetails
DELETE
FROM
    cart__store
WHERE
        cart_id IN (SELECT cart_id FROM cart WHERE meta_account_user_id = ${userId})
  AND   store_id = (SELECT store_id FROM store WHERE store_name = ${storeName})
`
  )
}

module.exports.deleteCartStoreDetails = async (cartId, storeName) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- deleteCartStoreDetails
DELETE
FROM
    cart__store
WHERE
      cart_id = ${cartId}
  AND store_id = (SELECT store_id FROM store WHERE store_name = ${storeName}) 
    `
  )
}

module.exports.updateCartStoreVersionId = async (cartId, versionId) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- updateCartStoreVersionId
UPDATE cart__store
SET
    cart__store_store_version_id = ${versionId}
WHERE
    cart_id = ${cartId}
    `
  )
}
