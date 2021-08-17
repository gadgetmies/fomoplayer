const sql = require('sql-template-strings')
const R = require('ramda')
const pg = require('../../db/pg.js')
const logger = require('../../logger')(__filename)

module.exports.addPurchasedTrackToUser = async (userId, storeTrack) => {
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- addPurchasedTrackToUser
INSERT INTO user__store__track_purchased
  (meta_account_user_id, user__store__track_purchased_time, store__track_id)
SELECT
  ${userId}
, ${storeTrack.purchased}
, store__track_id
FROM store__track
WHERE
  store__track_store_id = ${storeTrack.id}
ON CONFLICT
  ON CONSTRAINT user__store__track_purchased_meta_account_user_id_store__tr_key
  DO UPDATE SET
  user__store__track_purchased_time = ${storeTrack.purchased}
`
  )
}

module.exports.addArtistWatch = async (tx, userId, artistId) => {
  await tx.queryAsync(
    // language=PostgreSQL
    sql`-- addArtistWatch INSERT INTO store__artist_watch
INSERT INTO store__artist_watch
  (store__artist_id)
SELECT
  store__artist_id
FROM
  store__artist
  NATURAL JOIN artist
WHERE
  artist_id = ${artistId}
ON CONFLICT DO NOTHING
  `
  )

  await tx.queryAsync(
    // language=PostgreSQL
    sql`-- addArtistWatch INSERT INTO store__artist_watch__user
INSERT INTO store__artist_watch__user
  (store__artist_watch_id, meta_account_user_id)
SELECT
  store__artist_watch_id
, ${userId}
FROM
  store__artist_watch
  NATURAL JOIN store__artist
  NATURAL JOIN artist
WHERE
  artist_id = ${artistId}
ON CONFLICT DO NOTHING
  `
  )

  return (
    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- addArtistWatch SELECT store__artist_watch_id
SELECT
  store__artist_watch_id AS "followId"
FROM
  store__artist_watch
  NATURAL JOIN store__artist_watch__user
  NATURAL JOIN store__artist
WHERE
    meta_account_user_id = ${userId}
AND artist_id = ${artistId}`
    )
  )[0].followId
}

module.exports.addLabelWatch = async (tx, userId, labelId) => {
  await tx.queryAsync(
    // language=PostgreSQL
    sql`-- addLabelWatch INSERT INTO store__label_watch
INSERT INTO store__label_watch
  (store__label_id)
SELECT
  store__label_id
FROM
  store__label
  NATURAL JOIN label
WHERE
  label_id = ${labelId}
ON CONFLICT DO NOTHING
`
  )

  await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- addLabelWatch INSERT INTO store__label_watch__user
INSERT INTO store__label_watch__user
  (store__label_watch_id, meta_account_user_id)
SELECT
  store__label_watch_id
, ${userId}
FROM
  store__label_watch
  NATURAL JOIN store__label
WHERE
  label_id = ${labelId}
ON CONFLICT DO NOTHING
`
  )

  return (
    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- addLabelWatch SELECT store__label_watch_id
SELECT
  store__label_watch_id AS "followId"
FROM
  store__label_watch
  NATURAL JOIN store__label_watch__user
  NATURAL JOIN store__label
WHERE
    meta_account_user_id = ${userId}
AND label_id = ${labelId}`
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
    `
  )
}

module.exports.deleteArtistWatchFromUser = async (userId, artistId) => {
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
       NATURAL JOIN store__artist
       NATURAL JOIN store
     WHERE
       artist_id = ${artistId})
`
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
`
  )
}

module.exports.deleteLabelWatchFromUser = async (userId, labelId) => {
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
       label_id = ${labelId})
`
  )
}

module.exports.queryUserArtistFollows = async userId => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryUserArtistFollows
WITH
  distinct_store_artists AS (
    SELECT DISTINCT
      artist_name
    , artist_id
    , store_name
    , store_id
    FROM
      artist
      NATURAL JOIN store__artist
      NATURAL JOIN store__artist_watch
      NATURAL JOIN store__artist_watch__user
      NATURAL JOIN store
    WHERE
        meta_account_user_id = ${userId}
    AND (store_name <> 'Bandcamp' OR store__artist_url IS NOT NULL)
  )
SELECT
  artist_name                                                      AS name
, artist_id                                                        AS id
, array_agg(json_build_object('name', store_name, 'id', store_id)) AS stores
FROM distinct_store_artists
GROUP BY
  1, 2
ORDER BY
  1
`
  )
}

module.exports.queryUserLabelFollows = async userId => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryUserLabelFollows
WITH
  distinct_store_labels AS (
    SELECT DISTINCT
      label_name
    , label_id
    , store_name
    , store_id
    FROM
      label
      NATURAL JOIN store__label
      NATURAL JOIN store__label_watch
      NATURAL JOIN store__label_watch__user
      NATURAL JOIN store
    WHERE
      meta_account_user_id = ${userId}
  )
SELECT
  label_name                                                       AS name
, label_id                                                         AS id
, array_agg(json_build_object('name', store_name, 'id', store_id)) AS stores
FROM distinct_store_labels
GROUP BY
  1, 2
ORDER BY
  1
`
  )
}

module.exports.queryUserPlaylistFollows = async userId => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryUserPlaylistFollows
SELECT
  concat_ws(': ', store_playlist_type_label, playlist_title) AS title
, playlist_id                                                AS id
, store_name                                                 AS "storeName"
, store_id                                                   AS "storeId"
FROM
  playlist
  NATURAL JOIN user__playlist_watch
  NATURAL JOIN store_playlist_type
  NATURAL JOIN store
WHERE
  meta_account_user_id = ${userId}
ORDER BY
  1
`
  )
}

module.exports.queryUserArtistOnLabelIgnores = async userId => {
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
WHERE
  meta_account_user_id = ${userId}
`
  )
}

module.exports.queryUserLabelIgnores = async userId => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryLabelIgnores
SELECT
  label_id   AS id
, label_name AS name
FROM
  user__label_ignore
  NATURAL JOIN label
WHERE
  meta_account_user_id = ${userId}
`
  )
}

module.exports.queryUserArtistIgnores = async userId => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryArtistIgnores
SELECT
  artist_id   AS id
, artist_name AS name
FROM
  user__artist_ignore
  NATURAL JOIN artist
WHERE
  meta_account_user_id = ${userId}
`
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
`
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
`
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
`
  )
}

module.exports.queryUserTracks = username =>
  pg
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryUserTracks
WITH
  logged_user AS (
    SELECT
      meta_account_user_id
    FROM meta_account
    WHERE
      meta_account_username = ${username}
  )
, user_purchased_tracks AS (
  SELECT
    track_id
  FROM
    user__store__track_purchased
    NATURAL JOIN store__track
    NATURAL JOIN logged_user
)
, user_tracks_meta AS (
  SELECT
    COUNT(*)                                          AS total
  , COUNT(*) FILTER (WHERE user__track_heard IS NULL) AS new
  FROM
    user__track
    NATURAL JOIN logged_user
  WHERE
    track_id NOT IN (SELECT track_id FROM user_purchased_tracks)
)
, new_tracks AS (
  SELECT
    track_id
  , track_added
  , user__track_heard
  FROM
    logged_user
    NATURAL JOIN user__track
    NATURAL JOIN track
    NATURAL JOIN store__track
    NATURAL JOIN store
  WHERE
      user__track_heard IS NULL
  AND track_id NOT IN (SELECT track_id FROM user_purchased_tracks)
  GROUP BY 1, 2, 3
)
, label_scores AS (
  SELECT
    track_id
  , SUM(COALESCE(user_label_scores_score, 0)) AS label_score
  FROM
    new_tracks
    NATURAL LEFT JOIN track__label
    NATURAL LEFT JOIN user_label_scores
  GROUP BY 1
)
, label_follow_scores AS (
  SELECT 
    track_id,
    CASE WHEN bool_or(meta_account_user_id IS NOT NULL) THEN 1 ELSE 0 END AS label_follow_score
  FROM new_tracks
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
    new_tracks
    NATURAL JOIN track__artist
    NATURAL LEFT JOIN user_artist_scores
  GROUP BY 1
)
, artist_follow_scores AS (
  WITH follows AS (
    SELECT DISTINCT ON (track_id, artist_id)
      track_id
    , CASE WHEN bool_or(store__artist_watch_id IS NOT NULL) THEN 1 ELSE 0 END AS score
    FROM
      new_tracks
      NATURAL JOIN track__artist
      NATURAL JOIN store__artist
      NATURAL LEFT JOIN store__artist_watch
      NATURAL LEFT JOIN store__artist_watch__user
      NATURAL LEFT JOIN logged_user
    GROUP BY 1, artist_id
  )
  SELECT
    track_id,
    SUM(score) AS artist_follow_score
  FROM follows
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
  , user__track_heard
  , label_score * COALESCE(label_multiplier, 0) +
    artist_score * COALESCE(artist_multiplier, 0) +
    artist_follow_score * COALESCE(artist_follow_multiplier, 0) + 
    label_follow_score * COALESCE(label_follow_multiplier, 0)+ 
    COALESCE(added_score.score, 0) * COALESCE(date_added_multiplier, 0) +
    COALESCE(released_score.score, 0) * COALESCE(date_released_multiplier, 0) AS score,
    json_build_object(
      'label', json_build_object('score', label_score, 'multiplier', label_multiplier),
      'artist', json_build_object('score', artist_score, 'multiplier', artist_multiplier),
      'added', json_build_object('score', added_score.score, 'multiplier', date_added_multiplier),
      'released', json_build_object('score', released_score.score, 'multiplier', date_released_multiplier),
      'artist_follow', artist_follow_score,
      'label_follow', label_follow_score
    ) AS score_details
  FROM
    (SELECT
       track_id
     , user__track_heard
     , label_score
     , artist_score
     , label_follow_score
     , artist_follow_score
     , track_added
     , (SELECT
          user_track_score_weight_multiplier
        FROM user_score_weights
        WHERE
          user_track_score_weight_code = 'label'
       ) AS label_multiplier
     , (SELECT
          user_track_score_weight_multiplier
        FROM user_score_weights
        WHERE
          user_track_score_weight_code = 'artist'
       ) AS artist_multiplier
     , (SELECT
          user_track_score_weight_multiplier
        FROM user_score_weights
        WHERE
          user_track_score_weight_code = 'artist_follow'
       ) AS artist_follow_multiplier
     , (SELECT
          user_track_score_weight_multiplier
        FROM user_score_weights
        WHERE
          user_track_score_weight_code = 'label_follow'
       ) AS label_follow_multiplier
     , (SELECT
          user_track_score_weight_multiplier
        FROM user_score_weights
        WHERE
          user_track_score_weight_code = 'date_added'
       ) AS date_added_multiplier
     , (SELECT
          user_track_score_weight_multiplier
        FROM user_score_weights
        WHERE
          user_track_score_weight_code = 'date_published'
       ) AS date_released_multiplier
     FROM
       new_tracks
       NATURAL JOIN label_scores
       NATURAL JOIN artist_scores
       NATURAL JOIN label_follow_scores
       NATURAL JOIN artist_follow_scores
    ) AS tracks
    LEFT JOIN track_date_added_score AS added_score USING (track_id)
    LEFT JOIN track_date_released_score AS released_score USING (track_id)
  ORDER BY score DESC NULLS LAST
  LIMIT 200
)
, heard_tracks AS (
  SELECT
    track_id
  , user__track_heard
  , NULL :: NUMERIC AS score
  FROM
    user__track
    NATURAL JOIN logged_user
  WHERE
    user__track_heard IS NOT NULL
  ORDER BY user__track_heard DESC
  LIMIT 50
)
, limited_tracks AS (
  SELECT
    track_id
  , user__track_heard
  , score
  , score_details
  FROM new_tracks_with_scores
  UNION ALL
  SELECT
    track_id
  , user__track_heard
  , score
  , NULL :: JSON AS score_details
  FROM heard_tracks
)
, tracks_with_details AS (
  SELECT
    track_id AS id
  , title
  , heard
  , duration
  , added
  , artists
  , version
  , labels
  , remixers
  , keys
  , previews
  , stores
  , released
  , releases
  , score
  , score_details
  FROM
    limited_tracks lt
    JOIN track_details((SELECT ARRAY_AGG(track_id) FROM limited_tracks), (SELECT meta_account_user_id FROM logged_user)) td USING (track_id)
)
, new_tracks_with_details AS (
  SELECT
    json_agg(t) AS new_tracks
  FROM
    ( -- TODO: Why is the order by needed also here (also in new_tracks_with_scores)
      SELECT * FROM tracks_with_details WHERE heard IS NULL ORDER BY score DESC NULLS LAST, added DESC
    ) t
)
, heard_tracks_with_details AS (
  SELECT
    json_agg(t) AS heard_tracks
  FROM
    (
      SELECT * FROM tracks_with_details WHERE heard IS NOT NULL ORDER BY heard DESC
    ) t
)
SELECT
  json_build_object(
      'new', CASE WHEN new_tracks IS NULL THEN '[]'::JSON ELSE new_tracks END,
      'heard', CASE WHEN heard_tracks IS NULL THEN '[]'::JSON ELSE heard_tracks END
    ) AS tracks
, json_build_object(
      'total', total,
      'new', new
    ) AS meta
FROM
  new_tracks_with_details
, heard_tracks_with_details
, user_tracks_meta`
    )
    .then(R.head)

module.exports.addArtistOnLabelToIgnore = (tx, artistId, labelId, username) =>
  tx.queryAsync(
    // language=PostgreSQL
    sql`-- addArtistOnLabelToIgnore
INSERT INTO user__artist__label_ignore
  (meta_account_user_id, artist_id, label_id)
SELECT
  meta_account_user_id
, ${artistId}
, ${labelId}
FROM meta_account
WHERE
  meta_account_username = ${username}
ON CONFLICT ON CONSTRAINT user__artist__label_ignore_unique DO NOTHING
`
  )

module.exports.addArtistsToIgnore = async (tx, artistIds, username) => {
  for (const artistId of artistIds) {
    tx.queryAsync(
      // language=PostgreSQL
      sql`--addToIgnore
      INSERT INTO user__artist_ignore
        (meta_account_user_id, artist_id)
      SELECT
        meta_account_user_id
      , ${artistId}
      FROM meta_account
      WHERE
        meta_account_username = ${username}
      ON CONFLICT ON CONSTRAINT user__artist_ignore_artist_id_meta_account_user_id_key DO NOTHING
      `
    )
  }
}

module.exports.addLabelsToIgnore = async (tx, labelIds, username) => {
  for (const labelId of labelIds) {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`--addLabelToIgnore
INSERT INTO user__label_ignore
  (meta_account_user_id, label_id)
SELECT
  meta_account_user_id
, ${labelId}
FROM meta_account
WHERE
  meta_account_username = ${username}
ON CONFLICT ON CONSTRAINT user__label_ignore_label_id_meta_account_user_id_key DO NOTHING
`
    )
  }
}

module.exports.addReleasesToIgnore = async (tx, releaseIds, username) => {
  for (const releaseId of releaseIds) {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`--addLabelToIgnore
INSERT INTO user__release_ignore
  (meta_account_user_id, release_id)
SELECT
  meta_account_user_id
, ${releaseId}
FROM meta_account
WHERE
  meta_account_username = ${username}
ON CONFLICT ON CONSTRAINT user__release_ignore_release_id_meta_account_user_id_key DO NOTHING
`
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

module.exports.removeReleasesFromUser = (username, releases) => {
  logger.info('removeReleasesFromUser', { username, releases })
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
`
  )
}

module.exports.setTrackHeard = (trackId, username, heard) => {
  logger.info('setTrackHeard', { trackId, username, heard })
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- setTrackHeard
UPDATE user__track
SET
  user__track_heard = ${heard ? 'now()' : null}
WHERE
    track_id = ${trackId}
AND meta_account_user_id = (SELECT meta_account_user_id FROM meta_account WHERE meta_account_username = ${username})
`
  )
}

module.exports.setAllHeard = (username, heard) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- setAllHeard
UPDATE user__track
SET
  user__track_heard = ${heard ? 'NOW()' : null}
WHERE
    meta_account_user_id = (
    SELECT
      meta_account_user_id
    FROM meta_account
    WHERE
        meta_account_username = ${username}
    AND user__track_heard IS NULL)
`
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
`
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
AND playlist_id = ${playlistId}`
  )
}

module.exports.queryUserCarts = async userId => {
  const carts = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryUserCarts
SELECT
  cart_id   AS id
FROM cart
WHERE
  meta_account_user_id = ${userId}
`
  )

  const cartDetails = []
  for (const { id } of carts) {
    const [details] = await queryCartDetails(id, userId)
    cartDetails.push(details)
  }

  return cartDetails
}

module.exports.insertCart = async (userId, name) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--insertCart
INSERT INTO cart
  (cart_name, meta_account_user_id, cart_is_default)
VALUES
  (${name}, ${userId}, TRUE)
RETURNING cart_id AS id, cart_name AS name`
  )

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

const queryCartDetails = (module.exports.queryCartDetails = async (cartId, userId) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--queryCartDetails
WITH
  cart_tracks AS (SELECT array_agg(track_id) AS tracks FROM track__cart WHERE cart_id = ${cartId})
, td AS (SELECT (track_details((SELECT tracks FROM cart_tracks), ${userId})).*)
, renamed AS (SELECT track_id AS id, * FROM td)
, tracks AS (SELECT json_agg(renamed.*) AS tracks FROM renamed)
SELECT
  cart_id                           AS id
, cart_name                         AS name
, COALESCE(cart_is_default, FALSE)  AS is_default,
  CASE WHEN tracks.tracks IS NULL THEN '[]'::JSON ELSE tracks.tracks END AS tracks  
FROM
  cart,
  tracks
WHERE
  cart_id = ${cartId}
`
  ))

module.exports.deleteCart = async cartId =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- deleteCart
DELETE
FROM cart
WHERE
  cart_id = ${cartId}
`
  )

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
