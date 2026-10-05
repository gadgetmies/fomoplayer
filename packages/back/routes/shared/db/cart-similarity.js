const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const BPromise = require('bluebird')

// The only embedding type generated for previews (see search.js).
const EMBEDDING_TYPE = 'discogs_multi_embeddings-effnet-bs64-1'
const MAX_GROUPED_TRACKS = 600

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

// Mean embedding per cart track, most recently added first, capped at MAX_GROUPED_TRACKS.
module.exports.queryCartTrackEmbeddings = async (cartId) =>
  (
    await pg.queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryCartTrackEmbeddings
SELECT track_id, AVG(store__track_preview_embedding)::TEXT AS embedding
FROM track__cart
       NATURAL JOIN store__track
       NATURAL JOIN store__track_preview
       NATURAL JOIN store__track_preview_embedding
WHERE cart_id = ${cartId}
  AND store__track_preview_embedding_type = ${EMBEDDING_TYPE}
GROUP BY track_id
ORDER BY MAX(track__cart_added) DESC NULLS LAST, track_id DESC
LIMIT ${MAX_GROUPED_TRACKS}`,
    )
  ).map(({ track_id, embedding }) => ({ trackId: track_id, embedding: parseVector(embedding) }))

// Mean embedding of every analysed track in the user's carts: the centre of the user's collection. Computing it
// scans the whole collection (seconds for a large one) and it moves slowly, so it is cached per user for an hour.
const COLLECTION_MEAN_TTL_MS = 60 * 60 * 1000
const collectionMeanCache = new Map()

module.exports.queryCollectionMean = async (userId) => {
  const cached = collectionMeanCache.get(userId)
  if (cached && cached.expires > Date.now()) return cached.mean
  const [{ mean } = {}] = await pg.queryRowsAsync(
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
  const parsed = mean ? parseVector(mean) : undefined
  if (parsed) collectionMeanCache.set(userId, { mean: parsed, expires: Date.now() + COLLECTION_MEAN_TTL_MS })
  return parsed
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

/**
 * Candidate tracks for the cart search.
 *
 * Phase one pulls the `poolSize` nearest preview embeddings for every raw-space query vector through the HNSW index.
 * Phase two collapses previews to tracks, flags the tracks the user must not see, and scores each remaining track in
 * the centred space: cosine similarity of (track mean − collection mean) to every group centroid, plus the projection
 * onto the two map axes. Only scores travel back to Node, never the 1280-d vectors.
 */
module.exports.queryCandidates = async ({
  userId,
  cartId,
  queries,
  centroids,
  mean,
  axes,
  poolSize,
  excludeTrackIds = [],
}) =>
  BPromise.using(pg.getTransaction(), async (tx) => {
    // HNSW returns at most ef_search rows per query, so it must be at least the pool size.
    await tx.queryAsync(`SET LOCAL hnsw.ef_search = ${Math.max(40, Math.min(1000, Math.round(poolSize)))}`)
    return tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryCartSimilarityCandidates
WITH
  query_vectors AS (SELECT v::VECTOR AS v FROM UNNEST(${queries.map(vectorLiteral)}::TEXT[]) AS q(v))
, ann AS (SELECT DISTINCT a.store__track_preview_id
          FROM query_vectors
                 CROSS JOIN LATERAL (SELECT store__track_preview_id
                                     FROM store__track_preview_embedding
                                     WHERE store__track_preview_embedding_type = ${EMBEDDING_TYPE}
                                     ORDER BY store__track_preview_embedding <=> query_vectors.v
                                     LIMIT ${poolSize}) a)
, candidate AS (SELECT DISTINCT track_id
                FROM ann
                       NATURAL JOIN store__track_preview
                       NATURAL JOIN store__track
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
  })

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
