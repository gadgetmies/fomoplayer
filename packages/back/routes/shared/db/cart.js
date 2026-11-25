const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const logger = require('fomoplayer_shared').logger(__filename)

module.exports.queryCartOwner = async (cartId) => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryCartOwner
SELECT
  meta_account_user_id AS "ownerUserId"
FROM cart
WHERE
  cart_id = ${cartId}
`,
  )
}

module.exports.queryUserCartDetails = async (userId, stores) => {
  logger.info('start queryUserCartDetails', { userId, stores })
  const res = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryUserCartDetails
    WITH cart_store_details AS (SELECT cart_id
                                     , JSON_AGG(JSON_BUILD_OBJECT(
          'id', cart__store_cart_store_id,
          'url', cart__store_cart_url,
          'storeName', store_name,
          'versionId', cart__store_store_version_id
                                                )) AS store_details
                                FROM
                                  cart
                                  NATURAL JOIN cart__store
                                  NATURAL JOIN store
                                WHERE meta_account_user_id = ${userId} AND
                                      (${stores}::TEXT IS NULL OR LOWER(store_name) = ANY(${stores}))
                                GROUP BY 1)
       , track_counts AS (SELECT cart_id, COUNT(track_id) AS track_count
                          FROM
                            cart
                            NATURAL JOIN track__cart
                          GROUP BY 1)
    SELECT cart_id                                                                AS id
         , cart_name                                                              AS name
         , COALESCE(cart_is_default, FALSE)                                       AS "isDefault"
         , cart_is_public                                                         AS "isPublic"
         , COALESCE(cart_is_purchased, FALSE)                                     AS "isPurchased"
         , cart_uuid                                                              AS uuid
         , CASE WHEN store_details IS NULL THEN '[]'::JSON ELSE store_details END AS "storeDetails"
         , COALESCE(track_count, 0) :: INT                                        AS "trackCount"
    FROM
      cart
      NATURAL LEFT JOIN cart_store_details
      NATURAL LEFT JOIN track_counts
    WHERE meta_account_user_id = ${userId} AND cart_deleted IS NULL
    ORDER BY cart_is_default, cart_is_purchased, cart_name
    `,
  )

  logger.info('done queryUserCartDetails', { userId, stores })

  return res
}

module.exports.queryUserCartDetailsWithTracks = async (userId, stores) =>
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
                                 NATURAL JOIN store__track
                                 NATURAL JOIN store
                               WHERE ${stores}::TEXT IS NULL OR LOWER(store_name) = ANY(${stores})
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
          'storeName', store_name,
          'versionId', cart__store_store_version_id
                                                )) AS store_details
                                FROM
                                  cart_details
                                  NATURAL JOIN cart__store
                                  NATURAL JOIN store
                                GROUP BY 1)
    SELECT cart_id                                                                AS id
         , cart_name                                                              AS name
         , cart_is_default IS NOT NULL                                            AS "isDefault"
         , cart_is_public                                                         AS "isPublic"
         , cart_is_purchased IS NOT NULL                                          AS "isPurchased"
         , cart_uuid                                                              AS uuid
         , cart_deleted                                                           AS deleted
         , CASE WHEN tracks.tracks IS NULL THEN '[]'::JSON ELSE tracks.tracks END AS tracks
         , CASE WHEN store_details IS NULL THEN '[]'::JSON ELSE store_details END AS "storeDetails"
    FROM
      cart_details
      NATURAL LEFT JOIN
        tracks
      NATURAL LEFT JOIN
        cart_store_details
    ORDER BY cart_is_default, cart_is_purchased, cart_name
    `,
  )

// The `review` filter values of a cart's tracks; `to-review` matches the tracks with no decision (NULL state).
const REVIEW_FILTERS = (module.exports.REVIEW_FILTERS = ['to-review', 'accepted', 'rejected'])
// The decisions a cart track can hold; null (to review) clears a decision.
module.exports.REVIEW_STATES = ['accepted', 'rejected']

/**
 * A cart and one page of its tracks, newest first: `{ cart, tracks, page: { offset, limit, total }, meta: {} }`.
 * `cart` has the same fields as a row of the user's cart list (`trackCount` counts the whole cart); `page.total`
 * counts the tracks matching the store, since and review filters. `all` (for internal callers such as the playlist
 * sync) returns every track.
 *
 * Review fields are for the cart's owner only: with `includeReview` each track carries `reviewState` (null, 'accepted'
 * or 'rejected'), `cart.review` carries `{ enabled, counts, storeCounts }` (`counts` follow the store filter,
 * `storeCounts` cover the whole cart), and `review` (one of REVIEW_FILTERS) filters the page. Without it `review` is
 * ignored and no review field is returned.
 */
module.exports.queryCartDetails = async (
  cartId,
  stores = undefined,
  tracksFilter = { since: undefined, offset: 0, limit: 200 },
  { includeReview = false, review = undefined } = {},
) => {
  const limit = tracksFilter?.all ? null : parseInt(tracksFilter?.limit) || 200
  const offset = parseInt(tracksFilter?.offset) || 0
  const since = tracksFilter?.since || null
  const reviewFilter = includeReview && REVIEW_FILTERS.includes(review) ? review : null
  logger.info(`Querying cart details for cartId: ${cartId}, limit: ${limit}, offset: ${offset}, since: ${since}`)
  const query =
    // language=PostgreSQL
    sql`--queryCartDetails
    WITH cart_details AS (SELECT cart_id
                               , cart_name
                               , cart_is_default
                               , cart_is_public
                               , cart_is_purchased
                               , cart_uuid
                               , cart_is_in_review
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
                'storeName', store_name,
                'versionId', cart__store_store_version_id
            )) AS store_details
       FROM
         cart_details
         NATURAL JOIN cart__store
         NATURAL JOIN store
       GROUP BY 1)
       , matching_tracks AS (SELECT DISTINCT ON (track__cart_added, track_id) track_id
                                  , track_details
                                  , cart_id
                                  , track__cart_added
                                  , track__cart_review_state
                             FROM
                               track__cart
                               NATURAL JOIN track_details
                               NATURAL JOIN store__track
                               NATURAL JOIN store
                             WHERE cart_id = ${cartId}
                               AND (${stores}::TEXT IS NULL OR LOWER(store_name) = ANY(${stores}))
                               AND (${since}::TIMESTAMPTZ IS NULL OR track__cart_added > ${since}::TIMESTAMPTZ)
                               AND (${reviewFilter}::TEXT IS NULL
                                 OR (${reviewFilter} = 'to-review' AND track__cart_review_state IS NULL)
                                 OR track__cart_review_state = ${reviewFilter}))
       , cart_tracks AS (SELECT *
                         FROM matching_tracks
                         ORDER BY track__cart_added DESC
                         LIMIT ${limit} OFFSET ${offset})
       , user_track_carts AS (
                SELECT track_id, JSON_AGG(JSON_BUILD_OBJECT('uuid', cart_uuid)) AS carts
                FROM track__cart
                NATURAL JOIN cart
                WHERE cart.meta_account_user_id = (SELECT meta_account_user_id FROM cart WHERE cart_id = ${cartId})
                  AND cart_deleted IS NULL
                GROUP BY track_id)
       , td AS (SELECT DISTINCT ON (track_id) td.*
                                            , user__track_heard AS heard
                                            , track_id          AS id
                                            , track__cart_added
                                            , track__cart_review_state AS "reviewState"
                                            , COALESCE(user_track_carts.carts, '[]'::JSON) AS carts
                FROM
                  cart_tracks
                  NATURAL JOIN JSON_TO_RECORD(track_details) AS td ( track_id INT, title TEXT, duration INT, added DATE
                                                                   , artists JSON, version TEXT, labels JSON
                                                                   , remixers JSON, releases JSON, keys JSON
                                                                   , genres JSON, previews JSON, stores JSON
                                                                   , released DATE, published DATE)
                  NATURAL LEFT JOIN user__track
                  NATURAL LEFT JOIN user_track_carts)
       , tracks AS (SELECT JSON_AGG(td ORDER BY track__cart_added DESC) AS tracks FROM td)
    SELECT JSON_BUILD_OBJECT(
               'id', cart_id
             , 'name', cart_name
             , 'isDefault', COALESCE(cart_is_default, FALSE)
             , 'isPublic', cart_is_public
             , 'isPurchased', COALESCE(cart_is_purchased, FALSE)
             , 'uuid', cart_uuid
             , 'storeDetails', CASE WHEN store_details IS NULL THEN '[]'::JSON ELSE store_details END
             , 'trackCount', track_count :: INT
           )                                                                      AS cart
         , cart_is_in_review                                                      AS "isInReview"
         , CASE WHEN tracks.tracks IS NULL THEN '[]'::JSON ELSE tracks.tracks END AS tracks
         , (SELECT COUNT(*) FROM matching_tracks) :: INT                          AS total
    FROM
      cart_details
      NATURAL JOIN tracks
      NATURAL LEFT JOIN cart_store_details
    `

  const [details] = await pg.queryRowsAsync(query)
  logger.info(`Querying finished for cartId: ${cartId}, limit: ${limit}, offset: ${offset}`)
  if (!details) return null
  const { cart, tracks, total, isInReview } = details
  if (!includeReview) {
    return { cart, tracks: tracks.map(({ reviewState, ...track }) => track), page: { offset, limit, total }, meta: {} }
  }
  const [counts, storeCounts] = await Promise.all([queryCartReviewCounts(cartId, stores), queryCartStoreCounts(cartId)])
  return {
    cart: { ...cart, review: { enabled: isInReview, counts, storeCounts } },
    tracks,
    page: { offset, limit, total },
    meta: {},
  }
}

/**
 * The number of the cart's tracks in each review state, counting only the tracks in the given stores (all when
 * `stores` is null): `{ toReview, accepted, rejected, all }`.
 */
const queryCartReviewCounts = (module.exports.queryCartReviewCounts = async (cartId, stores = null) => {
  const [counts] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryCartReviewCounts
    WITH store_tracks AS (SELECT DISTINCT track_id, track__cart_review_state
                          FROM
                            track__cart
                            NATURAL JOIN track_details
                            NATURAL JOIN store__track
                            NATURAL JOIN store
                          WHERE cart_id = ${cartId}
                            AND (${stores}::TEXT IS NULL OR LOWER(store_name) = ANY(${stores})))
    SELECT COUNT(*) FILTER (WHERE track__cart_review_state IS NULL) :: INT          AS "toReview"
         , COUNT(*) FILTER (WHERE track__cart_review_state = 'accepted') :: INT    AS accepted
         , COUNT(*) FILTER (WHERE track__cart_review_state = 'rejected') :: INT    AS rejected
         , COUNT(*) :: INT                                                         AS "all"
    FROM store_tracks
    `,
  )
  return counts
})

// The number of the cart's tracks on each store that has any, by store name: `[{ store, count }]`.
const queryCartStoreCounts = (module.exports.queryCartStoreCounts = async (cartId) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryCartStoreCounts
    SELECT store_name AS store, COUNT(DISTINCT track_id) :: INT AS count
    FROM
      track__cart
      NATURAL JOIN track_details
      NATURAL JOIN store__track
      NATURAL JOIN store
    WHERE cart_id = ${cartId}
    GROUP BY store_name
    ORDER BY store_name
    `,
  ))

module.exports.updateCartIsInReview = async (cartId, enabled) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`--updateCartIsInReview
    UPDATE cart SET cart_is_in_review = ${enabled} WHERE cart_id = ${cartId}
    `,
  )

// Sets one cart track's review state (null for to review). Resolves to false when the track is not in the cart.
module.exports.updateCartTrackReviewState = async (cartId, trackId, state) => {
  const rows = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--updateCartTrackReviewState
    UPDATE track__cart
    SET track__cart_review_state = ${state}
    WHERE cart_id = ${cartId} AND track_id = ${trackId}
    RETURNING track_id
    `,
  )
  return rows.length > 0
}

/**
 * The cart's tracks in one review state within the given stores (all when null), newest first, with their added
 * date (as text, to keep Postgres' microseconds for an exact restore) and the stores they are on:
 * `[{ trackId, addedAt, stores: [{ name, url, release }] }]`.
 */
module.exports.queryCartTracksInReviewState = async (cartId, state, stores = null, db = pg) =>
  db.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryCartTracksInReviewState
    SELECT track_id AS "trackId", track__cart_added :: TEXT AS "addedAt", track_details -> 'stores' AS stores
    FROM
      track__cart
      NATURAL JOIN track_details
    WHERE cart_id = ${cartId}
      AND track__cart_review_state = ${state}
      AND (${stores}::TEXT IS NULL OR EXISTS (SELECT 1
                                              FROM store__track NATURAL JOIN store
                                              WHERE store__track.track_id = track__cart.track_id
                                                AND LOWER(store_name) = ANY(${stores})))
    ORDER BY track__cart_added DESC
    `,
  )

/**
 * Puts tracks back into a cart with their original added date and the given review state. Tracks already in the cart
 * are left as they are. Resolves to the ids of the tracks it put back.
 */
module.exports.restoreTracksToCart = async (tx, cartId, items, state) =>
  (
    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`--restoreTracksToCart
      INSERT INTO track__cart (cart_id, track_id, track__cart_added, track__cart_review_state)
      SELECT ${cartId}, t.track_id, t.added_at, ${state}
      FROM JSONB_TO_RECORDSET(${JSON.stringify(items.map((i) => ({ track_id: i.trackId, added_at: i.addedAt })))} :: JSONB)
        AS t(track_id INTEGER, added_at TIMESTAMPTZ)
      ON CONFLICT ON CONSTRAINT track__cart_cart_id_track_id_key DO NOTHING
      RETURNING track_id AS id
      `,
    )
  ).map(({ id }) => id)

module.exports.deleteCart = async (cartId) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- deleteCart
    UPDATE cart
    SET cart_deleted = NOW()
    WHERE cart_id = ${cartId}
    `,
  )

module.exports.updateCartProperties = async (tx, cartId, { name, isPublic }) => {
  await tx.queryAsync(
    // language=PostgreSQL
    sql`---updateCartProperties
    UPDATE cart
    SET
        cart_name      = COALESCE(${name} :: TEXT, cart_name)
      , cart_is_public = COALESCE(${isPublic}, cart_is_public)
    WHERE
        cart_id = ${cartId}
    `,
  )
}

module.exports.queryDefaultCartId = async (userId) => {
  const [{ id }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryDefaultCartId
SELECT
  cart_id AS id
FROM cart
WHERE
    cart_is_default = TRUE
AND meta_account_user_id = ${userId}
`,
  )
  return id
}

module.exports.insertCart = async (userId, cart, db = pg) => {
  const [createdCart] = await db.queryRowsAsync(
    // language=PostgreSQL
    sql`--insertCart
INSERT INTO cart
  (cart_name, meta_account_user_id)
VALUES
  (${cart.name}, ${userId})
RETURNING cart_id AS id, cart_uuid AS uuid, cart_name AS name
`,
  )

  if (cart.tracks) {
    await db.queryAsync(
      // language=PostgreSQL
      sql`--insertCart
INSERT INTO track__cart
  (cart_id, track_id)
SELECT ${createdCart.id}, track_id FROM unnest(${cart.tracks.map(({ trackId }) => trackId)}::BIGINT[]) AS track_id
ON CONFLICT DO NOTHING
`,
    )
  }

  return createdCart
}

module.exports.insertTracksToCart = async (cartId, items, db = pg) => {
  if (!items || items.length === 0) return

  const withDate = items.filter((i) => i.addedAt)
  const withoutDate = items.filter((i) => !i.addedAt)

  if (withoutDate.length > 0) {
    await db.queryRowsAsync(
      // language=PostgreSQL
      sql`--insertTracksToCart (no date)
INSERT INTO track__cart
  (cart_id, track_id)
SELECT
  ${cartId}
, track_id
FROM unnest(${withoutDate.map((i) => i.trackId)}:: INTEGER[]) AS track_id
ON CONFLICT ON CONSTRAINT track__cart_cart_id_track_id_key DO NOTHING`,
    )
  }

  if (withDate.length > 0) {
    const payload = withDate.map((i) => ({ track_id: i.trackId, added_at: i.addedAt }))
    await db.queryRowsAsync(
      // language=PostgreSQL
      sql`--insertTracksToCart (with date)
INSERT INTO track__cart
  (cart_id, track_id, track__cart_added)
SELECT
  ${cartId}
, t.track_id
, t.added_at
FROM jsonb_to_recordset(${JSON.stringify(payload)} :: JSONB)
  AS t(track_id INTEGER, added_at TIMESTAMPTZ)
ON CONFLICT ON CONSTRAINT track__cart_cart_id_track_id_key
DO UPDATE SET track__cart_added = EXCLUDED.track__cart_added`,
    )
  }
}

module.exports.queryCartTrackIds = async (cartId, db = pg) =>
  (
    await db.queryRowsAsync(
      // language=PostgreSQL
      sql`--queryCartTrackIds
SELECT track_id AS id
FROM track__cart
WHERE cart_id = ${cartId}
`,
    )
  ).map(({ id }) => id)

module.exports.deleteTracksFromCart = async (cartId, trackIds, db = pg) =>
  db.queryRowsAsync(
    // language=PostgreSQL
    sql`--deleteTracksFromCart
DELETE
FROM track__cart
WHERE
    track_id = ANY (${trackIds})
AND cart_id = ${cartId}
`,
  )

module.exports.queryCartStoreDetails = async (cartId) =>
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
  `,
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
    `,
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
`,
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
    `,
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
    `,
  )
}
