'use strict'
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const BPromise = require('bluebird')

// Previews fetched from the HNSW index per query vector and requested track: several previews can belong to one
// track, and the tracks the user must not see are dropped after the index scan.
const POOL_FACTOR = 5
const MIN_POOL = 40
const MAX_POOL = 1000

const vectorLiteral = (v) => `[${v.join(',')}]`

// Preview vectors held per stored embedding type.
module.exports.queryPreviewEmbeddingCounts = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryPreviewEmbeddingCounts
SELECT store__track_preview_embedding_type::TEXT AS type, COUNT(*)::INT AS count
FROM store__track_preview_embedding
GROUP BY store__track_preview_embedding_type`,
  )

module.exports.queryHasPreviewEmbeddings = async (type) => {
  const [{ exists }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryHasPreviewEmbeddings
SELECT EXISTS (SELECT 1 FROM store__track_preview_embedding WHERE store__track_preview_embedding_type = ${type}) AS exists`,
  )
  return exists
}

/**
 * Tracks whose preview vectors of `type` are closest to any of `vectors`, nearest first.
 *
 * Each query vector takes its nearest previews from the HNSW index (`ORDER BY vector <=> query LIMIT pool` per vector,
 * the only shape pgvector serves from the index); a track's distance is the smallest distance between any of its
 * previews and any query vector, and `queryIndex` is the 0-based position of that query vector. The same tracks are
 * left out as in the cart similarity search: tracks the user has heard, ignores (artist, label, release, artist on
 * label) or purchased.
 *
 * @returns {Promise<{trackId: number, distance: number, queryIndex: number}[]>}
 */
module.exports.queryNearestTracks = ({ userId, type, vectors, limit }) =>
  BPromise.using(pg.getTransaction(), async (tx) => {
    const poolSize = Math.min(MAX_POOL, Math.max(MIN_POOL, limit * POOL_FACTOR))
    // HNSW returns at most ef_search rows per scan, so it must be at least the pool size.
    await tx.queryAsync(`SET LOCAL hnsw.ef_search = ${poolSize}`)
    return tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryEmbeddingSimilarTracks
WITH
  query_vector AS (SELECT ord, v::VECTOR AS v
                   FROM UNNEST(${vectors.map(vectorLiteral)}::TEXT[]) WITH ORDINALITY AS q(v, ord))
, ann AS MATERIALIZED (SELECT a.store__track_preview_id, a.distance, query_vector.ord
                       FROM query_vector
                              CROSS JOIN LATERAL (SELECT store__track_preview_id
                                                       , store__track_preview_embedding <=> query_vector.v AS distance
                                                  FROM store__track_preview_embedding
                                                  WHERE store__track_preview_embedding_type = ${type}
                                                  ORDER BY store__track_preview_embedding <=> query_vector.v
                                                  LIMIT ${poolSize}) a)
, ann_track AS (SELECT DISTINCT ON (st.track_id) st.track_id, ann.distance, ann.ord
                FROM ann
                       JOIN store__track_preview p USING (store__track_preview_id)
                       JOIN store__track st USING (store__track_id)
                ORDER BY st.track_id, ann.distance, ann.ord)
SELECT track_id AS "trackId", distance, (ord - 1)::INT AS "queryIndex"
FROM ann_track c
WHERE NOT EXISTS (SELECT 1
                  FROM user__track ut
                  WHERE ut.track_id = c.track_id
                    AND ut.meta_account_user_id = ${userId}
                    AND ut.user__track_heard IS NOT NULL)
  AND NOT EXISTS (SELECT 1
                  FROM track__cart tc
                         JOIN cart USING (cart_id)
                  WHERE tc.track_id = c.track_id
                    AND cart.meta_account_user_id = ${userId}
                    AND cart.cart_is_purchased)
  AND NOT EXISTS (SELECT 1
                  FROM track__artist ta
                         JOIN user__artist_ignore i USING (artist_id)
                  WHERE ta.track_id = c.track_id AND i.meta_account_user_id = ${userId})
  AND NOT EXISTS (SELECT 1
                  FROM track__label tl
                         JOIN user__label_ignore i USING (label_id)
                  WHERE tl.track_id = c.track_id AND i.meta_account_user_id = ${userId})
  AND NOT EXISTS (SELECT 1
                  FROM release__track rt
                         JOIN user__release_ignore i USING (release_id)
                  WHERE rt.track_id = c.track_id AND i.meta_account_user_id = ${userId})
  AND NOT EXISTS (SELECT 1
                  FROM track__artist ta
                         JOIN track__label tl USING (track_id)
                         JOIN user__artist__label_ignore i
                              ON i.artist_id = ta.artist_id AND i.label_id = tl.label_id
                  WHERE ta.track_id = c.track_id AND i.meta_account_user_id = ${userId})
ORDER BY distance, track_id
LIMIT ${limit}`,
    )
  })
