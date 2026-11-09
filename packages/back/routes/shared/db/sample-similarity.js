const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const BPromise = require('bluebird')
const R = require('ramda')
const { EMBEDDING_TYPE, queryTrackDetails } = require('./cart-similarity')

// Previews fetched from the HNSW index per requested track: several previews can belong to one track, and matched or
// ignored tracks are dropped after the index scan.
const POOL_FACTOR = 5
const MAX_FOLLOW_SUGGESTIONS = 5

const sampleHasEmbedding = async (sampleId) => {
  const [{ exists }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- sampleHasEmbedding
SELECT EXISTS (SELECT 1
               FROM user_notification_audio_sample_embedding
               WHERE user_notification_audio_sample_id = ${sampleId}
                 AND user_notification_audio_sample_embedding_type = ${EMBEDDING_TYPE}) AS exists`,
  )
  return exists
}

// Tracks closest to the sample's audio embedding, one per track, leaving out the sample's fingerprint matches and the
// tracks the user ignores. Similarity is 1 − cosine distance of the closest preview.
const queryNearestTracks = (userId, sampleId, limit) =>
  BPromise.using(pg.getTransaction(), async (tx) => {
    const poolSize = Math.min(1000, Math.max(40, limit * POOL_FACTOR))
    // HNSW returns at most ef_search rows, so it must be at least the pool size.
    await tx.queryAsync(`SET LOCAL hnsw.ef_search = ${poolSize}`)
    return tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- querySampleSimilarTracks
WITH
  sample AS (SELECT user_notification_audio_sample_embedding AS v
             FROM user_notification_audio_sample_embedding
             WHERE user_notification_audio_sample_id = ${sampleId}
               AND user_notification_audio_sample_embedding_type = ${EMBEDDING_TYPE})
, ann AS MATERIALIZED (SELECT a.store__track_preview_id, a.distance
                       FROM sample
                              CROSS JOIN LATERAL (SELECT store__track_preview_id
                                                       , store__track_preview_embedding <=> sample.v AS distance
                                                  FROM store__track_preview_embedding
                                                  WHERE store__track_preview_embedding_type = ${EMBEDDING_TYPE}
                                                  ORDER BY store__track_preview_embedding <=> sample.v
                                                  LIMIT ${poolSize}) a)
, ann_track AS (SELECT st.track_id, MIN(ann.distance) AS distance
                FROM ann
                       JOIN store__track_preview p USING (store__track_preview_id)
                       JOIN store__track st USING (store__track_id)
                GROUP BY st.track_id)
SELECT track_id AS "trackId", GREATEST(0, 1 - distance) AS similarity
FROM ann_track c
WHERE NOT EXISTS (SELECT 1
                  FROM user_notification_audio_sample_match m
                         JOIN store__track_preview p USING (store__track_preview_id)
                         JOIN store__track st USING (store__track_id)
                  WHERE m.user_notification_audio_sample_id = ${sampleId}
                    AND st.track_id = c.track_id)
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

const queryFollowedEntityIds = async (userId) => {
  const [{ artistIds, labelIds }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- querySampleSimilarFollowedEntities
SELECT ARRAY(SELECT DISTINCT sa.artist_id
             FROM store__artist_watch__user wu
                    JOIN store__artist_watch w USING (store__artist_watch_id)
                    JOIN store__artist sa USING (store__artist_id)
             WHERE wu.meta_account_user_id = ${userId}) AS "artistIds"
     , ARRAY(SELECT DISTINCT sl.label_id
             FROM store__label_watch__user wu
                    JOIN store__label_watch w USING (store__label_watch_id)
                    JOIN store__label sl USING (store__label_id)
             WHERE wu.meta_account_user_id = ${userId}) AS "labelIds"`,
  )
  return { artistIds: new Set(artistIds), labelIds: new Set(labelIds) }
}

// The artists and labels that appear most often among the tracks, most frequent first; artists win ties.
const tallyFollowSuggestions = (tracks, { artistIds, labelIds }) => {
  const tally = new Map()
  const count = (type, { id, name }, followed) => {
    const key = `${type}:${id}`
    const entry = tally.get(key) ?? { type, id, name, count: 0, followed }
    entry.count += 1
    tally.set(key, entry)
  }
  for (const track of tracks) {
    for (const artist of R.uniqBy(R.prop('id'), track.artists ?? [])) count('artist', artist, artistIds.has(artist.id))
    for (const label of R.uniqBy(R.prop('id'), track.labels ?? [])) count('label', label, labelIds.has(label.id))
  }
  return [...tally.values()]
    .sort((a, b) => b.count - a.count || (a.type === b.type ? a.id - b.id : a.type === 'artist' ? -1 : 1))
    .slice(0, MAX_FOLLOW_SUGGESTIONS)
}

module.exports.querySampleSimilarTracks = async (userId, sampleId, limit) => {
  if (!(await sampleHasEmbedding(sampleId))) return { tracks: [], follow: [], pending: true }

  const nearest = await queryNearestTracks(userId, sampleId, limit)
  const details = new Map(
    (await queryTrackDetails(
      userId,
      nearest.map(({ trackId }) => trackId),
    )).map((track) => [track.id, track]),
  )
  const tracks = nearest
    .filter(({ trackId }) => details.has(trackId))
    .map(({ trackId, similarity }) => ({ ...details.get(trackId), similarity }))

  return { tracks, follow: tallyFollowSuggestions(tracks, await queryFollowedEntityIds(userId)), pending: false }
}

module.exports.tallyFollowSuggestions = tallyFollowSuggestions
