const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const BPromise = require('bluebird')
const logger = require('fomoplayer_shared').logger(__filename)

// The only embedding type generated for previews (see search.js).
const EMBEDDING_TYPE = 'discogs_multi_embeddings-effnet-bs64-1'
// The cart tracks used to form the groups: the most recently added ones.
const MAX_GROUPED_TRACKS = 300

const parseVector = (text) => JSON.parse(text)
const vectorLiteral = (v) => `[${v.join(',')}]`

module.exports.EMBEDDING_TYPE = EMBEDDING_TYPE
module.exports.MAX_GROUPED_TRACKS = MAX_GROUPED_TRACKS

module.exports.queryUserCartByUuid = async (userId, cartUuid) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(cartUuid))) return undefined
  const [cart] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryUserCartByUuid
SELECT cart_id AS id, cart_uuid AS uuid, cart_name AS name
FROM cart
WHERE cart_uuid = ${cartUuid}::UUID
  AND meta_account_user_id = ${userId}
  AND cart_deleted IS NULL`,
  )
  return cart
}

// Analysed cart tracks, most recently added first, capped at MAX_GROUPED_TRACKS. The newest tracks are picked before
// any embeddings are averaged, so a large cart (thousands of tracks) costs no more than a small one.
module.exports.queryCartTrackEmbeddings = async (cartId) =>
  (
    await pg.queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryCartTrackEmbeddings
WITH recent AS (SELECT tc.track_id, tc.track__cart_added
                FROM track__cart tc
                WHERE tc.cart_id = ${cartId}
                  AND EXISTS (SELECT 1
                              FROM store__track st
                                     NATURAL JOIN store__track_preview
                                     NATURAL JOIN store__track_preview_embedding e
                              WHERE st.track_id = tc.track_id
                                AND e.store__track_preview_embedding_type = ${EMBEDDING_TYPE})
                ORDER BY tc.track__cart_added DESC NULLS LAST, tc.track_id DESC
                LIMIT ${MAX_GROUPED_TRACKS})
SELECT track_id, AVG(store__track_preview_embedding)::TEXT AS embedding
FROM recent
       NATURAL JOIN store__track
       NATURAL JOIN store__track_preview
       NATURAL JOIN store__track_preview_embedding
WHERE store__track_preview_embedding_type = ${EMBEDDING_TYPE}
GROUP BY track_id
ORDER BY MAX(track__cart_added) DESC NULLS LAST, track_id DESC`,
    )
  ).map(({ track_id, embedding }) => ({ trackId: track_id, embedding: parseVector(embedding) }))

// Track counts shown next to the search: all tracks in the cart and those with an embedding.
module.exports.queryCartTrackCounts = async (cartId) => {
  const [{ total, analysed }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryCartTrackCounts
SELECT COUNT(*)::INT AS total
     , COUNT(*) FILTER (WHERE EXISTS (SELECT 1
                                      FROM store__track st
                                             NATURAL JOIN store__track_preview
                                             NATURAL JOIN store__track_preview_embedding e
                                      WHERE st.track_id = tc.track_id
                                        AND e.store__track_preview_embedding_type = ${EMBEDDING_TYPE}))::INT AS analysed
FROM track__cart tc
WHERE tc.cart_id = ${cartId}`,
  )
  return { total, analysed }
}

// Mean embedding of every analysed track in the user's carts: the centre of the user's collection. Computing it
// reads the whole collection's embeddings (5–10 s for a large one when they are not cached) and it moves slowly, so it
// is cached per user. After an hour the cached value is still returned while a fresh one is computed in the
// background, and it is computed ahead of time when the user's carts are loaded (warmCollectionMean).
const COLLECTION_MEAN_TTL_MS = 60 * 60 * 1000
const collectionMeanCache = new Map()
const collectionMeanInFlight = new Map()

const computeCollectionMean = (userId) => {
  if (collectionMeanInFlight.has(userId)) return collectionMeanInFlight.get(userId)
  const computation = pg
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryCollectionMean
SELECT AVG(store__track_preview_embedding)::TEXT AS mean
FROM store__track_preview_embedding
       NATURAL JOIN store__track_preview
       NATURAL JOIN store__track
WHERE store__track_preview_embedding_type = ${EMBEDDING_TYPE}
  AND track_id IN (SELECT track_id
                   FROM track__cart
                          NATURAL JOIN cart
                   WHERE meta_account_user_id = ${userId}
                     AND cart_deleted IS NULL)`,
    )
    .then(([{ mean } = {}]) => {
      const parsed = mean ? parseVector(mean) : undefined
      if (parsed) collectionMeanCache.set(userId, { mean: parsed, expires: Date.now() + COLLECTION_MEAN_TTL_MS })
      return parsed
    })
    .finally(() => collectionMeanInFlight.delete(userId))
  collectionMeanInFlight.set(userId, computation)
  return computation
}

module.exports.queryCollectionMean = async (userId) => {
  const cached = collectionMeanCache.get(userId)
  if (!cached) return computeCollectionMean(userId)
  if (cached.expires <= Date.now()) module.exports.warmCollectionMean(userId)
  return cached.mean
}

// Computes the collection mean in the background unless a fresh one is cached.
module.exports.warmCollectionMean = (userId) => {
  const cached = collectionMeanCache.get(userId)
  if (cached && cached.expires > Date.now()) return
  computeCollectionMean(userId).catch((e) => logger.error('Computing the collection mean failed', e))
}

// Mean embeddings for specific tracks (used for session misses).
module.exports.queryTrackEmbeddings = async (trackIds) =>
  trackIds.length === 0
    ? []
    : (
        await pg.queryRowsAsync(
          // language=PostgreSQL
          sql`-- queryTrackEmbeddings
SELECT track_id, AVG(store__track_preview_embedding)::TEXT AS embedding
FROM store__track_preview_embedding
       NATURAL JOIN store__track_preview
       NATURAL JOIN store__track
WHERE store__track_preview_embedding_type = ${EMBEDDING_TYPE}
  AND track_id = ANY (${trackIds}::INT[])
GROUP BY track_id`,
        )
      ).map(({ track_id, embedding }) => ({ trackId: track_id, embedding: parseVector(embedding) }))

// Nearest tracks to each raw-space query vector through the HNSW index: `poolSize` previews per query, collapsed to
// track ids. Cart tracks are left out.
module.exports.queryNearestTrackIds = async ({ cartId, queries, poolSize }) =>
  BPromise.using(pg.getTransaction(), async (tx) => {
    // HNSW returns at most ef_search rows per query, so it must be at least the pool size.
    await tx.queryAsync(`SET LOCAL hnsw.ef_search = ${Math.max(40, Math.min(1000, Math.round(poolSize)))}`)
    const rows = await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryCartSimilarityNearestTrackIds
WITH
  query_vectors AS (SELECT v::VECTOR AS v FROM UNNEST(${queries.map(vectorLiteral)}::TEXT[]) AS q(v))
, ann AS (SELECT DISTINCT a.store__track_preview_id
          FROM query_vectors
                 CROSS JOIN LATERAL (SELECT store__track_preview_id
                                     FROM store__track_preview_embedding
                                     WHERE store__track_preview_embedding_type = ${EMBEDDING_TYPE}
                                     ORDER BY store__track_preview_embedding <=> query_vectors.v
                                     LIMIT ${poolSize}) a)
-- Materialised so the previews are resolved to tracks by primary key: a hash join here scanned all of store__track,
-- which pushed the HNSW index out of the cache.
, ann_track AS MATERIALIZED (SELECT DISTINCT st.track_id
                             FROM ann
                                    JOIN store__track_preview p USING (store__track_preview_id)
                                    JOIN store__track st USING (store__track_id))
SELECT track_id
FROM ann_track a
WHERE NOT EXISTS (SELECT 1 FROM track__cart tc WHERE tc.cart_id = ${cartId} AND tc.track_id = a.track_id)`,
    )
    return rows.map(({ track_id }) => track_id)
  })

/**
 * Scores candidate tracks for the cart search.
 *
 * Flags the tracks the user must not see and scores each remaining track in the centred space: cosine similarity of
 * (track mean − collection mean) to every group centroid, plus the projection onto the two map axes. Only scores
 * travel back to Node, never the 1280-d vectors. Cart tracks and `excludeTrackIds` are left out.
 */
module.exports.scoreCandidates = async ({ userId, cartId, trackIds, centroids, mean, axes, excludeTrackIds = [] }) =>
  trackIds.length === 0
    ? []
    : pg.queryRowsAsync(
        // language=PostgreSQL
        sql`-- queryCartSimilarityCandidates
WITH
  candidate AS (SELECT DISTINCT track_id
                FROM UNNEST(${trackIds}::INT[]) AS c(track_id)
                WHERE track_id NOT IN (SELECT track_id FROM track__cart WHERE cart_id = ${cartId})
                  AND track_id <> ALL (${excludeTrackIds}::INT[]))
, candidate_embedding AS (SELECT track_id, AVG(store__track_preview_embedding) - ${vectorLiteral(mean)}::VECTOR AS e
                          FROM candidate
                                 NATURAL JOIN store__track
                                 NATURAL JOIN store__track_preview
                                 NATURAL JOIN store__track_preview_embedding
                          WHERE store__track_preview_embedding_type = ${EMBEDDING_TYPE}
                          GROUP BY track_id)
, purchased AS MATERIALIZED (SELECT track_id
                             FROM track__cart
                                    NATURAL JOIN cart
                             WHERE meta_account_user_id = ${userId}
                               AND cart_is_purchased)
, purchased_artist AS MATERIALIZED (SELECT DISTINCT artist_id
                                    FROM track__artist
                                    WHERE track_id IN (SELECT track_id FROM purchased))
, followed_artist AS MATERIALIZED (SELECT DISTINCT sa.artist_id
                                   FROM store__artist_watch__user wu
                                          JOIN store__artist_watch w USING (store__artist_watch_id)
                                          JOIN store__artist sa USING (store__artist_id)
                                   WHERE wu.meta_account_user_id = ${userId})
, group_vector AS MATERIALIZED (SELECT ord, v::VECTOR AS v
                                FROM UNNEST(${centroids.map(vectorLiteral)}::TEXT[]) WITH ORDINALITY AS g(v, ord))
, axis_vector AS MATERIALIZED (SELECT ord, v::VECTOR AS v
                               FROM UNNEST(${axes.map(vectorLiteral)}::TEXT[]) WITH ORDINALITY AS a(v, ord))
SELECT track_id
     , EXISTS (SELECT 1
               FROM user__track ut
               WHERE ut.track_id = c.track_id
                 AND ut.meta_account_user_id = ${userId}
                 AND ut.user__track_heard IS NOT NULL)                                  AS heard
     , (EXISTS (SELECT 1
                FROM track__artist ta
                       JOIN user__artist_ignore i USING (artist_id)
                WHERE ta.track_id = c.track_id AND i.meta_account_user_id = ${userId})
       OR EXISTS (SELECT 1
                  FROM track__label tl
                         JOIN user__label_ignore i USING (label_id)
                  WHERE tl.track_id = c.track_id AND i.meta_account_user_id = ${userId})
       OR EXISTS (SELECT 1
                  FROM release__track rt
                         JOIN user__release_ignore i USING (release_id)
                  WHERE rt.track_id = c.track_id AND i.meta_account_user_id = ${userId})
       OR EXISTS (SELECT 1
                  FROM track__artist ta
                         JOIN track__label tl USING (track_id)
                         JOIN user__artist__label_ignore i
                              ON i.artist_id = ta.artist_id AND i.label_id = tl.label_id
                  WHERE ta.track_id = c.track_id AND i.meta_account_user_id = ${userId})) AS ignored
     , EXISTS (SELECT 1 FROM purchased p WHERE p.track_id = c.track_id)                AS purchased
     , EXISTS (SELECT 1
               FROM track__artist ta
               WHERE ta.track_id = c.track_id
                 AND ta.artist_id IN (SELECT artist_id FROM followed_artist))         AS artist_followed
     , EXISTS (SELECT 1
               FROM track__artist ta
               WHERE ta.track_id = c.track_id
                 AND ta.artist_id IN (SELECT artist_id FROM purchased_artist))        AS artist_purchased
     , ARRAY(SELECT 1 - (c.e <=> g.v) FROM group_vector g ORDER BY g.ord)             AS similarities
     , ARRAY(SELECT -(c.e <#> a.v) / NULLIF(VECTOR_NORM(c.e), 0)
             FROM axis_vector a
             ORDER BY a.ord)                                                          AS projection
FROM candidate_embedding c`,
      )

// track_details rows for the given track ids, in the shape the track search returns.
module.exports.queryTrackDetails = async (userId, trackIds) =>
  trackIds.length === 0
    ? []
    : pg.queryRowsAsync(
        // language=PostgreSQL
        sql`-- queryCartSimilarityTrackDetails
WITH logged_user AS (SELECT ${userId}::INT AS meta_account_user_id)
SELECT track_id                                         AS id
     , td.*
     , user__track_heard                                AS heard
     , COALESCE(user_track_carts.carts, '[]'::JSON)     AS carts
FROM track_details
       JOIN JSON_TO_RECORD(track_details) AS td ( track_id INT, title TEXT, duration INT, added DATE, artists JSON
                                                , version TEXT, labels JSON, remixers JSON, releases JSON, keys JSON
                                                , genres JSON, previews JSON, stores JSON, released DATE
                                                , published DATE, source_details JSON)
            USING (track_id)
       NATURAL LEFT JOIN (user__track NATURAL JOIN logged_user)
       LEFT JOIN (SELECT track_id, JSON_AGG(JSON_BUILD_OBJECT('uuid', cart_uuid)) AS carts
                  FROM track__cart
                         NATURAL JOIN cart
                  WHERE cart.meta_account_user_id = ${userId}
                    AND cart_deleted IS NULL
                  GROUP BY track_id) user_track_carts USING (track_id)
WHERE track_id = ANY (${trackIds}::INT[])`,
      )
