const sql = require('sql-template-strings')
const R = require('ramda')
const pg = require('fomoplayer_shared').db.pg
const logger = require('fomoplayer_shared').logger(__filename)
const BPromise = require('bluebird')

module.exports.addPurchasedTracksToUsers = async (userIds, trackIds) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- addPurchasedTracksToUsers
INSERT INTO track__cart (cart_id, track_id) 
SELECT cart_id, track_id
FROM cart, unnest(${trackIds} :: BIGINT[]) AS tracks(track_id)
WHERE meta_account_user_id = ANY(${userIds}) AND cart_is_purchased
ON CONFLICT DO NOTHING
`,
  )
}

const composableSql = (parts, ...args) => {
  try {
    return parts.reduce(
      (query, part, i) => {
        return query.append(part).append(args[i] === undefined ? '' : args[i])
      },
      sql``,
    )
  } catch (e) {
    console.error(e)
    throw e
  }
}

module.exports.addPurchasedStoreTrackToUser = async (tx, userId, storeTrack) =>
  await tx.queryAsync(
    // language=PostgreSQL
    sql`-- addPurchasedStoreTrackToUser
INSERT INTO track__cart
    (cart_id, track_id, track__cart_added)
SELECT cart_id,
       track_id
        ,
       ${storeTrack.purchased}
FROM cart,
     store__track
WHERE store__track_store_id = ${storeTrack.id}
  AND meta_account_user_id = ${userId}
  AND cart_is_purchased
ON CONFLICT
    ON CONSTRAINT track__cart_cart_id_track_id_key
    DO UPDATE SET track__cart_added = ${storeTrack.purchased}
`,
  )

module.exports.queryStoreArtistIds = async (tx, artistId) => {
  return (
    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryStoreArtistIds
SELECT store__artist_id AS "id"
FROM store__artist
WHERE artist_id = ${artistId}
`,
    )
  ).map(({ id }) => id)
}

module.exports.addStoreArtistWatch = async (tx, userId, storeArtistId) => {
  if (!storeArtistId) {
    logger.error('storeArtistId not provided for addStoreArtistWatch')
    throw new Error('Error in adding follow')
  }

  await tx.queryAsync(
    // language=PostgreSQL
    sql`-- addArtistWatch INSERT INTO store__artist_watch
INSERT INTO store__artist_watch (store__artist_id)
VALUES (${storeArtistId})
ON CONFLICT DO NOTHING
  `,
  )

  await tx.queryAsync(
    // language=PostgreSQL
    sql`-- addArtistWatch INSERT INTO store__artist_watch__user
INSERT INTO store__artist_watch__user
    (store__artist_watch_id, meta_account_user_id)
SELECT store__artist_watch_id
     , ${userId}
FROM store__artist_watch
WHERE store__artist_id = ${storeArtistId}
ON CONFLICT DO NOTHING
  `,
  )

  const res = await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- addArtistWatch SELECT store__artist_watch_id
SELECT store__artist_watch_id AS "followId"
FROM store__artist_watch
         NATURAL JOIN store__artist_watch__user
WHERE meta_account_user_id = ${userId}
  AND store__artist_id = ${storeArtistId}`,
  )

  return res[0].followId
}

module.exports.queryStoreLabelIds = async (tx, labelId) => {
  return (
    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryStoreLabelIds
SELECT store__label_id AS id FROM store__label WHERE label_id = ${labelId} 
`,
    )
  ).map(({ id }) => id)
}

module.exports.addStoreLabelWatch = async (tx, userId, storeLabelId) => {
  await tx.queryAsync(
    // language=PostgreSQL
    sql`-- addLabelWatch INSERT INTO store__label_watch
INSERT INTO store__label_watch
    (store__label_id)
VALUES (${storeLabelId})
ON CONFLICT DO NOTHING
`,
  )

  await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- addLabelWatch INSERT INTO store__label_watch__user
INSERT INTO store__label_watch__user
    (store__label_watch_id, meta_account_user_id)
SELECT store__label_watch_id
     , ${userId}
FROM store__label_watch
WHERE store__label_id = ${storeLabelId}
ON CONFLICT DO NOTHING
`,
  )

  return (
    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- addLabelWatch SELECT store__label_watch_id
SELECT store__label_watch_id AS "followId"
FROM store__label_watch
         NATURAL JOIN store__label_watch__user
WHERE meta_account_user_id = ${userId}
  AND store__label_id = ${storeLabelId}`,
    )
  )[0].followId
}

module.exports.deleteArtistWatchesFromUser = async (storeUrl, user) => {
  // language=PostgreSQL
  await pg.queryAsync(
    sql`--deleteArtistWatchesFromUser
DELETE
FROM store__artist_watch__user
WHERE
    meta_account_user_id = ${user.id}
AND store__artist_watch_id IN
    (SELECT
       store__artist_watch_id
     FROM
       store__artist_watch
       NATURAL JOIN store__artist
       NATURAL JOIN store
     WHERE
       store_url = ${storeUrl})
    `,
  )
}

// TODO: does this leave empty rows in store__artist_watch? Is that an issue?
module.exports.deleteArtistWatchFromUser = async (userId, storeArtistId) => {
  // language=PostgreSQL
  await pg.queryAsync(
    sql`-- deleteArtistWatchFromUser
DELETE
FROM store__artist_watch__user
WHERE
    meta_account_user_id = ${userId}
AND store__artist_watch_id IN
    (SELECT
       store__artist_watch_id
     FROM
       store__artist_watch
     WHERE
       store__artist_id = ${storeArtistId})
`,
  )
}

module.exports.deleteLabelWatchesFromUser = async (storeUrl, user) => {
  // language=PostgreSQL
  await pg.queryAsync(
    sql`-- deleteLabelWatchesFromUser
DELETE
FROM store__label_watch__user
WHERE
    meta_account_user_id = ${user.id}
AND store__label_watch_id IN
    (SELECT
       store__label_watch_id
     FROM
       store__label_watch
       NATURAL JOIN store__label
       NATURAL JOIN store
     WHERE
       store_url = ${storeUrl})
`,
  )
}

module.exports.deleteLabelWatchFromUser = async (userId, storeLabelId) => {
  // language=PostgreSQL
  await pg.queryAsync(
    sql`-- deleteLabelWatchFromUser
DELETE
FROM store__label_watch__user
WHERE
    meta_account_user_id = ${userId}
AND store__label_watch_id IN
    (SELECT
       store__label_watch_id
     FROM
       store__label_watch
       NATURAL JOIN store__label
       NATURAL JOIN store
     WHERE
       store__label_id = ${storeLabelId})
`,
  )
}

module.exports.queryUserArtistFollows = async (userId, store = undefined) => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryUserArtistFollows
WITH distinct_store_artists AS (
    SELECT DISTINCT artist_id
                  , artist_name
                  , store__artist_id
                  , store__artist_url
                  , store_name
                  , store_id
                  , store__artist_watch__user_id
                  , store__artist_watch__user_starred
    FROM artist
             NATURAL JOIN store__artist
             NATURAL JOIN store__artist_watch
             NATURAL JOIN store__artist_watch__user
             NATURAL JOIN store
    WHERE meta_account_user_id = ${userId}
      AND (store_name <> 'Bandcamp' OR store__artist_url IS NOT NULL)
      AND ${store}::TEXT IS NULL OR LOWER(store_name) = ${store}
)
SELECT artist_name                                           AS name
     , artist_id                                             AS id
     , store__artist_id                                      AS "storeArtistId"
     , store__artist_url                                     AS url
     , json_build_object(
         'name', store_name, 
         'id', store_id, 
         'starred', store__artist_watch__user_starred,
         'watchId', store__artist_watch__user_id
     ) AS store
FROM distinct_store_artists
ORDER BY 1, store_name
`,
  )
}

module.exports.queryUserLabelFollows = async (userId, store = undefined) => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryUserLabelFollows
WITH distinct_store_labels AS (
    SELECT DISTINCT label_name
                  , label_id
                  , store__label_id
                  , store__label_url
                  , store_name
                  , store_id
                  , store__label_watch__user_id
                  , store__label_watch__user_starred
    FROM label
             NATURAL JOIN store__label
             NATURAL JOIN store__label_watch
             NATURAL JOIN store__label_watch__user
             NATURAL JOIN store
    WHERE meta_account_user_id = ${userId} AND
          ${store}::TEXT IS NULL OR LOWER(store_name) = ${store}
)
SELECT label_name                                            AS name
     , label_id                                              AS id
     , store__label_id                                       AS "storeLabelId"
     , store__label_url                                      AS url
     , json_build_object(
         'name', store_name, 
         'id', store_id,
         'starred', store__label_watch__user_starred,
         'watchId', store__label_watch__user_id
     ) AS store
FROM distinct_store_labels
ORDER BY 1, store_name
`,
  )
}

module.exports.queryUserPlaylistFollows = async (userId, store = undefined) => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryUserPlaylistFollows
SELECT
  concat_ws(': ', store_playlist_type_label, playlist_title) AS title
, playlist_id                                                AS id
, store_name                                                 AS "storeName"
, playlist_store_id                                          AS "playlistStoreId"
, store_id                                                   AS "storeId"
FROM
  playlist
  NATURAL JOIN user__playlist_watch
  NATURAL JOIN store_playlist_type
  NATURAL JOIN store
WHERE
  meta_account_user_id = ${userId} AND
  ${store}::TEXT IS NULL OR LOWER(store_name) = ${store}
ORDER BY
  1
`,
  )
}

module.exports.queryUserArtistOnLabelIgnores = async (userId, store = undefined) => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryArtistOnLabelIgnores
SELECT
  json_build_object('id', artist_id, 'name', artist_name)
    AS artist
, json_build_object('id', label_id, 'name', label_name)
    AS label
FROM
  user__artist__label_ignore
  NATURAL JOIN artist
  NATURAL JOIN label
  NATURAL JOIN store__artist
  NATURAL JOIN store
WHERE
  meta_account_user_id = ${userId} AND
  ${store}::TEXT IS NULL OR LOWER(store_name) = ${store}
`,
  )
}

module.exports.queryUserLabelIgnores = async (userId, store = undefined) => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryLabelIgnores
SELECT
  label_id        AS id
, label_name      AS name
FROM
  user__label_ignore
  NATURAL JOIN label
  NATURAL JOIN store__label
  NATURAL JOIN store 
WHERE
  meta_account_user_id = ${userId} AND
  ${store}::TEXT IS NULL OR LOWER(store_name) = ${store}
`,
  )
}

module.exports.queryUserArtistIgnores = async (userId, store = undefined) => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryArtistIgnores
SELECT
  artist_id   AS id
, artist_name AS name
FROM
  user__artist_ignore
  NATURAL JOIN artist
  NATURAL JOIN store__artist
  NATURAL JOIN store
WHERE
  meta_account_user_id = ${userId} AND
  ${store}::TEXT IS NULL OR LOWER(store_name) = ${store}
`,
  )
}

module.exports.deleteArtistOnLabelIgnoreFromUser = async (userId, { artistId, labelId }) => {
  return pg.queryAsync(
    // language=PostgreSQL
    sql`-- deleteArtistOnLabelIgnoreFromUser
DELETE
FROM user__artist__label_ignore
WHERE
    meta_account_user_id = ${userId}
AND artist_id = ${artistId}
AND label_id = ${labelId}
`,
  )
}
module.exports.deleteLabelIgnoreFromUser = async (userId, labelId) => {
  return pg.queryAsync(
    // language=PostgreSQL
    sql`-- deleteLabelIgnoreFromUser
DELETE
FROM user__label_ignore
WHERE
    meta_account_user_id = ${userId}
AND label_id = ${labelId}
`,
  )
}
module.exports.deleteArtistIgnoreFromUser = async (userId, artistId) => {
  return pg.queryAsync(
    // language=PostgreSQL
    sql`--deleteArtistIgnoreFromUser
DELETE
FROM user__artist_ignore
WHERE
    meta_account_user_id = ${userId}
AND artist_id = ${artistId}
`,
  )
}

module.exports.queryUserTracks = async (userId, store = undefined, limits = { new: 80, recent: 50, heard: 20 }) => {
  // language=PostgreSQL
  const sort = sql`ORDER BY artists_starred + label_starred :: int DESC, score DESC NULLS LAST`

  const res = await BPromise.using(pg.getTransaction(), async (tx) => {
    // language=PostgreSQL
    return tx
      .queryRowsAsync(
        composableSql`-- queryUserTracks
WITH
    logged_user AS (
        SELECT ${sql`${userId}`} :: INT AS meta_account_user_id
    ),
   stores AS (
    SELECT store_id, 
           store_name 
    FROM store
    WHERE ${sql`${store}`} :: TEXT IS NULL OR LOWER(store_name) = ${sql`${store}`}
  )
  , user_purchased_tracks AS (
    SELECT
        track_id
    FROM
        track__cart
            NATURAL JOIN cart
            NATURAL JOIN logged_user
    WHERE
        cart_is_purchased
)
  , user_tracks_meta AS (
    SELECT
        COUNT(*)                                          AS total
      , COUNT(*) FILTER (WHERE user__track_heard IS NULL) AS new
    FROM
        user__track
            NATURAL JOIN logged_user
            NATURAL JOIN store__track
            NATURAL JOIN stores
    WHERE
        track_id NOT IN (SELECT track_id FROM user_purchased_tracks) AND
        ${sql`${store}`} :: TEXT IS NULL OR LOWER(store_name) = ${sql`${store}`}
)
  , new_tracks AS (
    SELECT
        track_id
      , NULL AS user__track_heard
      , MIN(track_added) AS track_added
    FROM
        logged_user
            NATURAL JOIN user__track
            NATURAL JOIN track
            NATURAL JOIN store__track
            NATURAL JOIN stores
    WHERE
          user__track_heard IS NULL
      AND user__track_ignored IS NULL
      AND track_id NOT IN (SELECT track_id FROM user_purchased_tracks)
    GROUP BY track_id
    ORDER BY MIN(track_added) DESC
)
  , tracks_to_score AS (
    SELECT track_id
    FROM new_tracks
    LIMIT 1000
)
  , label_scores AS (
    SELECT
        track_id
      , SUM(COALESCE(user_label_scores_score, 0)) AS label_score
    FROM
        tracks_to_score
            NATURAL LEFT JOIN track__label
            NATURAL LEFT JOIN user_label_scores
    GROUP BY 1
)
  , label_follow_scores AS (
    SELECT
        track_id
      , COALESCE(BOOL_OR(store__label_watch__user_starred), FALSE) AS label_starred   
      , CASE WHEN BOOL_OR(meta_account_user_id IS NOT NULL) THEN 1 ELSE 0 END AS label_follow_score
    FROM
        tracks_to_score
            NATURAL LEFT JOIN track__label
            NATURAL LEFT JOIN store__label
            NATURAL LEFT JOIN store__label_watch
            NATURAL LEFT JOIN store__label_watch__user
            NATURAL LEFT JOIN logged_user
    GROUP BY 1
)
  , artist_scores AS (
    SELECT
        track_id
      , SUM(COALESCE(user_artist_scores_score, 0)) AS artist_score
    FROM
        tracks_to_score
            NATURAL JOIN track__artist
            NATURAL LEFT JOIN user_artist_scores
    GROUP BY 1
)
  , artist_follow_scores AS (
    WITH
        follows AS (
            SELECT DISTINCT ON (track_id, artist_id)
                track_id
              , COALESCE(BOOL_OR(store__artist_watch__user_starred), FALSE) AS artist_starred
              , CASE WHEN BOOL_OR(store__artist_watch_id IS NOT NULL) THEN 1 ELSE 0 END AS score
            FROM
                tracks_to_score
                    NATURAL JOIN track__artist
                    NATURAL JOIN store__artist
                    NATURAL LEFT JOIN store__artist_watch
                    NATURAL LEFT JOIN store__artist_watch__user
                    NATURAL LEFT JOIN logged_user
            GROUP BY 1, artist_id
        )
    SELECT
        track_id
      , SUM(score) AS artist_follow_score
      , SUM(COALESCE(artist_starred :: int, 0)) AS artists_starred
    FROM
        follows
    GROUP BY 1
)
  , user_score_weights AS (
    SELECT
        user_track_score_weight_code
      , user_track_score_weight_multiplier
    FROM
        user_track_score_weight
            NATURAL JOIN logged_user
)
  , new_tracks_with_scores AS (
    SELECT
        track_id
      , artists_starred
      , label_starred 
      , user__track_heard
      , COALESCE(label_score, 0) * COALESCE(label_multiplier, 0) +
        COALESCE(artist_score, 0) * COALESCE(artist_multiplier, 0) +
        COALESCE(artist_follow_score, 0) * COALESCE(artist_follow_multiplier, 0) +
        label_follow_score * COALESCE(label_follow_multiplier, 0) +
        COALESCE(added_score.score, 0) * COALESCE(date_added_multiplier, 0) +
        COALESCE(released_score.score, 0) * COALESCE(date_released_multiplier, 0) +
        COALESCE(published_score.score, 0) * COALESCE(date_published_multiplier, 0) 
      AS score
      , JSON_BUILD_OBJECT(
          'artist', JSON_BUILD_OBJECT('score', COALESCE(artist_score, 0), 'weight', artist_multiplier),
          'artist_follow', JSON_BUILD_OBJECT('score', COALESCE(artist_follow_score, 0), 'weight', artist_follow_multiplier),
          'label', JSON_BUILD_OBJECT('score', COALESCE(label_score, 0), 'weight', label_multiplier),
          'label_follow', JSON_BUILD_OBJECT('score', COALESCE(label_follow_score, 0), 'weight', label_follow_multiplier),
          'date_added', JSON_BUILD_OBJECT('score', ROUND(added_score.score, 1), 'weight', date_added_multiplier),
          'date_released',
          JSON_BUILD_OBJECT('score', ROUND(released_score.score, 1), 'weight', date_released_multiplier),
          'date_published',
          JSON_BUILD_OBJECT('score', ROUND(published_score.score, 1), 'weight', date_published_multiplier)
        )
      AS score_details
    FROM
        (SELECT
             track_id
           , user__track_heard
           , label_score
           , artist_score
           , label_follow_score
           , artist_follow_score
           , track_added
           , artists_starred
           , label_starred
           , (SELECT
                  user_track_score_weight_multiplier
              FROM
                  user_score_weights
              WHERE
                  user_track_score_weight_code = 'label'
             ) AS label_multiplier
           , (SELECT
                  user_track_score_weight_multiplier
              FROM
                  user_score_weights
              WHERE
                  user_track_score_weight_code = 'artist'
             ) AS artist_multiplier
           , (SELECT
                  user_track_score_weight_multiplier
              FROM
                  user_score_weights
              WHERE
                  user_track_score_weight_code = 'artist_follow'
             ) AS artist_follow_multiplier
           , (SELECT
                  user_track_score_weight_multiplier
              FROM
                  user_score_weights
              WHERE
                  user_track_score_weight_code = 'label_follow'
             ) AS label_follow_multiplier
           , (SELECT
                  user_track_score_weight_multiplier
              FROM
                  user_score_weights
              WHERE
                  user_track_score_weight_code = 'date_added'
             ) AS date_added_multiplier
           , (SELECT
                  user_track_score_weight_multiplier
              FROM
                  user_score_weights
              WHERE
                  user_track_score_weight_code = 'date_released'
             ) AS date_released_multiplier
           , (SELECT
                  user_track_score_weight_multiplier
              FROM
                  user_score_weights
              WHERE
                  user_track_score_weight_code = 'date_published'
             ) AS date_published_multiplier
         FROM
             new_tracks
                 NATURAL LEFT JOIN label_scores
                 NATURAL LEFT JOIN artist_scores
                 NATURAL LEFT JOIN label_follow_scores
                 NATURAL LEFT JOIN artist_follow_scores
        ) AS tracks
            LEFT JOIN track_date_added_score AS added_score USING (track_id)
            LEFT JOIN track_date_released_score AS released_score USING (track_id)
            LEFT JOIN track_date_published_score AS published_score USING (track_id)
          ${sort}
          LIMIT ${sql`${limits.new}`}
      )
        , heard_tracks AS (
          SELECT track_id, user__track_heard
          FROM user__track
            NATURAL JOIN logged_user
            NATURAL JOIN store__track
            NATURAL JOIN store
          WHERE user__track_heard IS NOT NULL
            AND ${sql`${store}`} :: TEXT IS NULL OR LOWER(store_name) = ${sql`${store}`}
      )
        , recently_heard AS (
          SELECT *
          FROM heard_tracks 
          ORDER BY user__track_heard DESC NULLS LAST
          LIMIT ${sql`${limits.heard}`}
      )
        , recently_added AS (
          SELECT track_id
               , MAX(track_added)
          FROM logged_user
            NATURAL JOIN user__track
            NATURAL JOIN track
            NATURAL JOIN store__track
            NATURAL JOIN stores
          WHERE user__track_heard IS NULL
          GROUP BY 1
          LIMIT ${sql`${limits.recent}`}
      )
         , limited_tracks AS (
          SELECT DISTINCT track_id
          FROM
          (
            SELECT track_id FROM new_tracks_with_scores
            UNION ALL
            SELECT track_id FROM recently_heard
            UNION ALL
            SELECT track_id FROM recently_added
          ) t
      )
         , tracks_with_details AS (
          SELECT track_id AS id
               , track_details->>'title' AS title
               , user__track_heard AS heard
               , track_details->>'duration' AS duration
               , cast(track_details->>'added' AS DATE) AS added
               , track_details->'artists' AS artists
               , track_details->>'version' AS version
               , track_details->'labels' AS labels
               , track_details->'remixers' AS remixers
               , track_details->'keys' AS keys
               , track_details->'genres' AS genres
               , track_details->'previews' AS previews 
               , track_details->'stores' AS stores
               , cast(track_details->>'released' AS DATE) AS released
               , cast(track_details->>'published' AS DATE) AS published
               , track_details->'releases' AS releases
               , track_details->'source_details' AS source_details
          FROM limited_tracks lt
                   NATURAL JOIN track_details
                   NATURAL LEFT JOIN heard_tracks
      )
         , new_tracks_with_details AS (
          SELECT JSON_AGG(t) AS new_tracks
          FROM ( -- TODO: Why is the order by needed also here (also in new_tracks_with_scores)
          -- TODO: do the sort parameters in the request even matter when this is here?
                   SELECT * FROM tracks_with_details 
                   JOIN new_tracks_with_scores ON (id = track_id)
                   ${sort}
               ) t
      )
         , heard_tracks_with_details AS (
          SELECT JSON_AGG(t) AS heard_tracks
          FROM (
                   SELECT * FROM tracks_with_details
                   JOIN recently_heard ON (id = track_id)
                   ORDER BY user__track_heard DESC
               ) t
      )
         , recently_added_tracks_with_details AS (
          SELECT JSON_AGG(t) AS recently_added
          FROM (
                   SELECT * FROM tracks_with_details
                   JOIN recently_added ON (id = track_id)
                   ORDER BY added DESC
               ) t
      )
      SELECT JSON_BUILD_OBJECT(
              'new', CASE WHEN new_tracks IS NULL THEN '[]'::JSON ELSE new_tracks END,
              'heard', CASE WHEN heard_tracks IS NULL THEN '[]'::JSON ELSE heard_tracks END,
              'recentlyAdded', CASE WHEN recently_added IS NULL THEN '[]'::JSON ELSE recently_added END
          ) AS tracks
           , JSON_BUILD_OBJECT(
              'total', total,
              'new', new
          ) AS meta
      FROM new_tracks_with_details
         , heard_tracks_with_details
         , recently_added_tracks_with_details
         , user_tracks_meta`,
      )
      .then(R.head)
  })

  const uniqueNewTracks = R.uniqBy(R.prop('track_id'), res.tracks.new)
  const uniqueHeardTracks = R.uniqBy(R.prop('track_id'), res.tracks.heard)
  const uniqueAddedTracks = R.uniqBy(R.prop('track_id'), res.tracks.recentlyAdded)

  const duplicateNewTracks = R.difference(res.tracks.new, uniqueNewTracks)
  const duplicateHeardTracks = R.difference(res.tracks.heard, uniqueHeardTracks)
  const duplicateAddedTracks = R.difference(res.tracks.recentlyAdded, uniqueAddedTracks)

  if (duplicateNewTracks.length > 0 || duplicateHeardTracks.length > 0 || duplicateAddedTracks.length > 0) {
    logger.error('Duplicate tracks found in user tracks', {
      duplicateNewTracks,
      duplicateHeardTracks,
      duplicateAddedTracks,
    })
  }

  return {
    ...res,
    tracks: {
      new: uniqueNewTracks,
      heard: uniqueHeardTracks,
      recentlyAdded: uniqueAddedTracks,
    },
  }
}

module.exports.addArtistOnLabelToIgnore = (tx, artistId, labelId, userId) =>
  tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- addArtistOnLabelToIgnore
INSERT INTO user__artist__label_ignore
    (meta_account_user_id, artist_id, label_id)
VALUES ( ${userId}
       , ${artistId}
       , ${labelId})
ON CONFLICT ON CONSTRAINT user__artist__label_ignore_unique DO NOTHING
RETURNING user__artist__label_ignore_id
`,
  )

module.exports.deleteArtistsOnLabelsIgnores = async (artistsOnLabelsIgnoreIds) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- removeArtistsOnLabelsIgnores
DELETE
FROM
    user__artist__label_ignore
WHERE
    user__artist__label_ignore_id = ANY (${artistsOnLabelsIgnoreIds})
`,
  )

module.exports.addArtistsToIgnore = async (tx, artistIds, userId) => {
  for (const artistId of artistIds) {
    tx.queryAsync(
      // language=PostgreSQL
      sql`--addToIgnore
INSERT INTO user__artist_ignore
    (meta_account_user_id, artist_id)
VALUES ( ${userId}
       , ${artistId})
ON CONFLICT ON CONSTRAINT user__artist_ignore_artist_id_meta_account_user_id_key DO NOTHING
`,
    )
  }
}

module.exports.addLabelsToIgnore = async (tx, labelIds, userId) => {
  for (const labelId of labelIds) {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`--addLabelToIgnore
INSERT INTO user__label_ignore
    (meta_account_user_id, label_id)
VALUES ( ${userId}
       , ${labelId})
ON CONFLICT ON CONSTRAINT user__label_ignore_label_id_meta_account_user_id_key DO NOTHING
`,
    )
  }
}

module.exports.addReleasesToIgnore = async (tx, releaseIds, userId) => {
  for (const releaseId of releaseIds) {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`--addLabelToIgnore
INSERT INTO user__release_ignore
    (meta_account_user_id, release_id)
VALUES ( ${userId}
       , ${releaseId})
ON CONFLICT ON CONSTRAINT user__release_ignore_release_id_meta_account_user_id_key DO NOTHING
`,
    )
  }
}

module.exports.artistOnLabelInIgnore = async (tx, userId, artists, labelId) => {
  const [{ isIgnored }] = await tx.queryRowsAsync(sql`--artistOnLabelInIgnore
SELECT EXISTS(
               SELECT user__artist__label_ignore_id
               from user__artist__label_ignore
               where meta_account_user_id = ${userId}
                 and label_id = ${labelId}
                 and artist_id = ANY (${artists.map(R.prop('id'))}::int[])
    ) AS "isIgnored"
`)

  return isIgnored
}

module.exports.removeReleasesFromUser = (userId, releases) => {
  logger.debug('removeReleasesFromUser', { userId, releases })
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- removeReleasesFromUser
DELETE
FROM user__track
WHERE
    track_id IN (
    SELECT track_id
    FROM release__track
    WHERE release_id = ANY (${releases})
  )
`,
  )
}

module.exports.setTrackHeard = (trackId, userId, heard) => {
  logger.debug('setTrackHeard', { trackId, userId, heard })
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- setTrackHeard
UPDATE user__track
SET
  user__track_heard = ${heard ? 'now()' : null}
WHERE
    track_id = ${trackId}
AND meta_account_user_id = (SELECT meta_account_user_id FROM meta_account WHERE meta_account_user_id = ${userId})
`,
  )
}

module.exports.setAllHeard = (userId, heard, interval) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- setAllHeard
UPDATE user__track
SET user__track_heard = ${heard ? 'NOW()' : null}
WHERE track_id IN (
    SELECT track_id
    FROM user__track
             NATURAL JOIN track
             NATURAL JOIN store__track
    WHERE meta_account_user_id = ${userId}
      AND user__track_heard IS NULL
      AND store__track_released < NOW() - ${interval}::INTERVAL
)
`,
  )

module.exports.addTrackToUser = async (tx, userId, trackId, sourceId) => {
  await tx.queryAsync(
    // language=PostgreSQL
    sql`--addTrackToUser
INSERT INTO user__track
  (track_id, meta_account_user_id, user__track_source)
VALUES
  (${trackId}, ${userId}, ${sourceId})
ON CONFLICT ON CONSTRAINT user__track_track_id_meta_account_user_id_key DO NOTHING
`,
  )
}

module.exports.addTracksToUser = async (tx, userId, trackIds, sourceId) => {
  await tx.queryAsync(
    // language=PostgreSQL
    sql`--addTracksToUser
WITH track_ids AS (
    SELECT UNNEST(${trackIds}::int[]) AS track_id
)
INSERT INTO user__track
  (track_id, meta_account_user_id, user__track_source)
SELECT track_id, ${userId}, ${sourceId} FROM track_ids
ON CONFLICT ON CONSTRAINT user__track_track_id_meta_account_user_id_key DO NOTHING
`,
  )
}

module.exports.deletePlaylistFollowFromUser = async (userId, playlistId) => {
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- deletePlaylistFollowFromUser
DELETE
FROM user__playlist_watch
WHERE
    meta_account_user_id = ${userId}
AND playlist_id = ${playlistId}`,
  )
}

module.exports.queryUserScoreWeights = async (userId) => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryUserScoreWeights
SELECT user_track_score_weight_code       AS property,
       user_track_score_weight_multiplier AS weight
FROM user_track_score_weight
WHERE meta_account_user_id = ${userId}
ORDER BY user_track_score_weight_code
`,
  )
}

module.exports.updateUserScoreWeights = async (userId, weights) => {
  return pg.queryAsync(
    // language=PostgreSQL
    sql`--updateUserScoreWeights
UPDATE user_track_score_weight SET
user_track_score_weight_multiplier = w.weight
FROM json_to_recordset(${JSON.stringify(weights)}) AS w(property TEXT, weight FLOAT)
WHERE user_track_score_weight_code = w.property
`,
  )
}

module.exports.queryNotificationOwner = async (notificationId) => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryNotificationOwner
SELECT
  meta_account_user_id AS "ownerUserId"
FROM user_search_notification
WHERE
  user_search_notification_id = ${notificationId}
`,
  )
}

const followTypeToTable = {
  artists: 'store__artist_watch__user',
  labels: 'store__label_watch__user',
  playlists: 'user__playlist_watch',
}
module.exports.queryFollowOwner = async (type, followId) => {
  return pg.queryRowsAsync(
    sql`--queryFollowOwner
SELECT
  meta_account_user_id AS "ownerUserId"
FROM `
      .append(followTypeToTable[type])
      .append(sql` WHERE `)
      .append(`${followTypeToTable[type]}_id`)
      .append(` = ${followId}`),
  )
}

module.exports.queryNotifications = async (userId) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--insertNotification
SELECT 
    user_search_notification_id AS id, 
    user_search_notification_string AS text, 
    store_name AS "storeName",
    store_purchase_available AS "purchaseAvailable"
FROM user_search_notification NATURAL JOIN user_search_notification__store NATURAL JOIN store
WHERE meta_account_user_id = ${userId}
`,
  )

module.exports.updateNotifications = async (tx, userId, operations) => {
  for (const { op, text, storeName } of operations) {
    const [{ notificationId }] = await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`--insertNotification user_search_notification
      INSERT INTO user_search_notification (meta_account_user_id, user_search_notification_string)
      VALUES (${userId}, LOWER(${text}))
      ON CONFLICT ON CONSTRAINT user_search_notification_meta_account_user_id_user_search_n_key DO UPDATE
      SET meta_account_user_id = ${userId} -- This is here only so that RETURNING always returns a row
      RETURNING user_search_notification_id AS "notificationId"
      `,
    )

    if (op === 'add') {
      await tx.queryAsync(
        // language=PostgreSQL
        sql`--store notification stores
INSERT INTO user_search_notification__store (user_search_notification_id, store_id)
SELECT ${notificationId}, store_id
FROM store
WHERE store_name = ${storeName}
        `,
      )
    } else if (op === 'remove') {
      await tx.queryAsync(
        // language=PostgreSQL
        sql`--store notification stores
DELETE
FROM user_search_notification__store
WHERE user_search_notification_id = ${notificationId}
  AND store_id = (SELECT store_id
                  FROM store
                  WHERE store_name = ${storeName})
        `,
      )
    }
    const [{ subscriptionsExist }] = await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`--deleteNotification search for store notifications
SELECT EXISTS (SELECT 1
               FROM user_search_notification__store
               WHERE user_search_notification_id = ${notificationId}) AS "subscriptionsExist"
    `,
    )

    if (!subscriptionsExist) {
      logger.info('no stores exits, removing notification')
      tx.queryAsync(
        // language=PostgreSQL
        sql`--deleteNotification
    DELETE
    FROM user_search_notification
    WHERE user_search_notification_id = ${notificationId}
    `,
      )
    }
  }
}

module.exports.getTracksWithIds = async (trackIds) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--getTracksWithIds
SELECT * FROM track_details(${trackIds})
`,
  )

module.exports.setFollowStarred = async (type, followId, starred) => {
  return pg.queryRowsAsync(
    sql`--setFollowStarred
UPDATE `
      .append(followTypeToTable[type])
      .append(sql` SET `)
      .append(`${followTypeToTable[type]}_starred`)
      .append(sql` = ${starred}`)
      .append(' WHERE ')
      .append(`${followTypeToTable[type]}_id`)
      .append(sql` = ${followId}`),
  )
}

module.exports.queryUserSettings = async (userId) => {
  const [settings] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`SELECT COALESCE(s.email, d.email) AS email, COALESCE(s.emailVerified, d.emailVerified) AS "emailVerified"
FROM (SELECT meta_account_email_address AS email, meta_account_email_verified AS emailVerified, 1 AS query_id
      FROM meta_account_email
      WHERE meta_account_user_id = ${userId}) s
         RIGHT JOIN (SELECT NULL AS email, FALSE AS emailVerified, 1 AS query_id) d ON s.query_id = d.query_id
    `,
  )

  return settings
}

module.exports.queryAuthorizations = async (userId) => {
  const [{ authorizations }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`WITH authorizations AS
               (SELECT JSON_AGG(
                           JSON_BUILD_OBJECT(
                               'store_name', store_name,
                               'has_write_access', user__store_authorization_scopes @>
                                                   '{playlist-modify-private,playlist-modify-public,user-follow-modify}')) AS authorizations
                FROM
                  store
                  NATURAL JOIN user__store_authorization
                WHERE meta_account_user_id = ${userId})
        SELECT CASE WHEN authorizations IS NULL THEN '[]'::JSON ELSE authorizations END
        FROM
          authorizations
    `,
  )
  return authorizations
}

module.exports.deleteAuthorization = async (userId, storeName) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`DELETE
FROM
    user__store_authorization
WHERE
      meta_account_user_id = ${userId}
  AND store_id = (SELECT store_id FROM store WHERE store_name = ${storeName})
`,
  )
}

module.exports.upsertEmail = async (userId, email) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- updateEmail
INSERT INTO meta_account_email (meta_account_email_address, meta_account_user_id, meta_account_email_verification_code)
VALUES (${email}, ${userId}, uuid_generate_v4())
ON CONFLICT ON CONSTRAINT meta_account_email_meta_account_user_id_key
  DO UPDATE SET meta_account_email_address           = EXCLUDED.meta_account_email_address
              , meta_account_email_verified          = FALSE
              , meta_account_email_verification_code = uuid_generate_v4()
    `,
  )

module.exports.getEmailVerificationCode = async (userId) => {
  const [{ verificationCode }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getEmailVerificationCode
    SELECT meta_account_email_verification_code AS "verificationCode"
    FROM meta_account_email
    WHERE meta_account_user_id = ${userId}
    `,
  )

  return verificationCode
}
