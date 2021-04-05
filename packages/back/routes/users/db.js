const sql = require('sql-template-strings')
const R = require('ramda')
const { using } = require('bluebird')
const pg = require('../../db/pg.js')
const { apiURL } = require('../../config')

module.exports.addPurchasedTrackToUser = async (userId, storeTrack) => {
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`INSERT INTO user__store__track_purchased (meta_account_user_id, user__store__track_purchased_time, store__track_id)
SELECT ${userId}, ${storeTrack.purchased}, store__track_id
FROM store__track
WHERE store__track_store_id = ${storeTrack.id}
ON CONFLICT
    ON CONSTRAINT user__store__track_purchased_meta_account_user_id_store__tr_key
    DO UPDATE SET user__store__track_purchased_time = ${storeTrack.purchased}
`
  )
}

module.exports.addArtistWatch = async (tx, userId, artistId) => {
  await tx.queryAsync(
    // language=PostgreSQL
    sql`INSERT INTO store__artist_watch (store__artist_id)
SELECT store__artist_id
FROM store__artist
         NATURAL JOIN artist
WHERE artist_id = ${artistId}
ON CONFLICT DO NOTHING
  `
  )

  await tx.queryAsync(
    // language=PostgreSQL
    sql`INSERT INTO store__artist_watch__user (store__artist_watch_id, meta_account_user_id)
SELECT store__artist_watch_id, ${userId}
FROM store__artist_watch
         NATURAL JOIN store__artist
         NATURAL JOIN artist
WHERE artist_id = ${artistId}
ON CONFLICT DO NOTHING
  `
  )

  return (
    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`SELECT store__artist_watch_id AS "followId"
FROM store__artist_watch
         NATURAL JOIN store__artist_watch__user
         NATURAL JOIN store__artist
WHERE meta_account_user_id = ${userId}
  AND artist_id = ${artistId}`
    )
  )[0].followId
}

module.exports.addLabelWatch = async (tx, userId, labelId) => {
  await tx.queryAsync(
    // language=PostgreSQL
    sql`INSERT INTO store__label_watch (store__label_id)
SELECT store__label_id
FROM store__label
         NATURAL JOIN label
WHERE label_id = ${labelId}
ON CONFLICT DO NOTHING
  `
  )

  await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`INSERT INTO store__label_watch__user (store__label_watch_id, meta_account_user_id)
SELECT store__label_watch_id, ${userId}
FROM store__label_watch
NATURAL JOIN store__label
WHERE label_id = ${labelId}
ON CONFLICT DO NOTHING
  `
  )

  return (
    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`SELECT store__label_watch_id AS "followId"
FROM store__label_watch
         NATURAL JOIN store__label_watch__user
         NATURAL JOIN store__label
WHERE meta_account_user_id = ${userId}
  AND label_id = ${labelId}`
    )
  )[0].followId
}

module.exports.deleteArtistWatchesFromUser = async (storeUrl, user) => {
  // language=PostgreSQL
  await pg.queryAsync(
    sql`DELETE
FROM store__artist_watch__user
WHERE meta_account_user_id = ${user.id}
  AND store__artist_watch_id IN
      (SELECT store__artist_watch_id
       FROM store__artist_watch
                NATURAL JOIN store__artist
                NATURAL JOIN store
       WHERE store_url = ${storeUrl})
    `
  )
}

module.exports.deleteArtistWatchFromUser = async (userId, artistId) => {
  console.log({ userId, artistId })
  // language=PostgreSQL
  await pg.queryAsync(
    sql`DELETE
FROM store__artist_watch__user
WHERE meta_account_user_id = ${userId}
  AND store__artist_watch_id IN
      (SELECT store__artist_watch_id
       FROM store__artist_watch
                NATURAL JOIN store__artist
                NATURAL JOIN store
       WHERE artist_id = ${artistId})
    `
  )
}

module.exports.deleteLabelWatchesFromUser = async (storeUrl, user) => {
  // language=PostgreSQL
  await pg.queryAsync(
    sql`DELETE
FROM store__label_watch__user
WHERE meta_account_user_id = ${user.id}
  AND store__label_watch_id IN
      (SELECT store__label_watch_id
       FROM store__label_watch
                NATURAL JOIN store__label
                NATURAL JOIN store
       WHERE store_url = ${storeUrl})
    `
  )
}

module.exports.deleteLabelWatchFromUser = async (userId, labelId) => {
  // language=PostgreSQL
  await pg.queryAsync(
    sql`DELETE
FROM store__label_watch__user
WHERE meta_account_user_id = ${userId}
  AND store__label_watch_id IN
      (SELECT store__label_watch_id
       FROM store__label_watch
                NATURAL JOIN store__label
                NATURAL JOIN store
       WHERE label_id = ${labelId})
    `
  )
}

module.exports.queryUserArtistFollows = async userId => {
  return pg.queryAsync(
    // language=PostgreSQL
    sql`SELECT artist_name AS name, artist_id AS id, array_agg(json_build_object('name', store_name, 'id', store_id)) AS stores
FROM artist
         NATURAL JOIN store__artist
         NATURAL JOIN store__artist_watch
         NATURAL JOIN store__artist_watch__user
         NATURAL JOIN store
WHERE meta_account_user_id = ${userId}
GROUP BY 1, 2
ORDER BY 1
`
  )
}

module.exports.queryUserLabelFollows = async userId => {
  return pg.queryAsync(
    // language=PostgreSQL
    sql`SELECT label_name AS name, label_id AS id, array_agg(json_build_object('name', store_name, 'id', store_id)) AS stores
FROM label
         NATURAL JOIN store__label
         NATURAL JOIN store__label_watch
         NATURAL JOIN store__label_watch__user
         NATURAL JOIN store
WHERE meta_account_user_id = ${userId}
GROUP BY 1, 2
ORDER BY 1
    `
  )
}

module.exports.queryUserPlaylistFollows = async userId => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`SELECT playlist_title AS title, playlist_id AS id, store_name AS "storeName", store_id as "storeId"
FROM playlist
         NATURAL JOIN user__playlist_watch
         NATURAL JOIN store
WHERE meta_account_user_id = ${userId}
ORDER BY 1
`
  )
}

module.exports.queryUserTracks = username =>
  pg
    .queryRowsAsync(
      // language=PostgreSQL
      sql`WITH
  logged_user AS (
    SELECT meta_account_user_id
    FROM meta_account
    WHERE meta_account_username = ${username}
  ),
  user_purchased_tracks AS (
    SELECT track_id FROM user__store__track_purchased 
        NATURAL JOIN store__track 
        NATURAL JOIN logged_user
  ),
  user_tracks_meta AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE user__track_heard IS NULL) as new
    FROM user__track
    NATURAL JOIN logged_user
    WHERE track_id NOT IN (SELECT track_id FROM user_purchased_tracks)
  ),
  new_tracks AS (
    SELECT
      track_id,
      track_added,
      user__track_heard
    FROM logged_user
      NATURAL JOIN user__track
      NATURAL JOIN track
    NATURAL JOIN store__track
    NATURAL JOIN store
    WHERE user__track_heard IS NULL AND 
          track_id NOT IN (SELECT track_id FROM user_purchased_tracks) AND store_name = 'Spotify'
    GROUP BY 1, 2, 3
  ),
  label_scores AS (
    SELECT
      track_id,
      SUM(COALESCE(user_label_scores_score, 0)) AS label_score
    FROM new_tracks
    NATURAL LEFT JOIN track__label
    NATURAL LEFT JOIN user_label_scores
    GROUP BY 1
  ),
  artist_scores AS (
    SELECT
      track_id,
      SUM(COALESCE(user_artist_scores_score, 0)) AS artist_score
    FROM new_tracks
    NATURAL JOIN track__artist
    NATURAL LEFT JOIN user_artist_scores
    GROUP BY 1
  ),
  user_score_weights AS (
    SELECT user_track_score_weight_code, user_track_score_weight_multiplier
    FROM user_track_score_weight
    NATURAL JOIN logged_user
  ),
  new_tracks_with_scores AS (
      SELECT track_id,
             user__track_heard,
             label_score * COALESCE(label_multiplier, 0) +
             artist_score * COALESCE(artist_multiplier, 0) +
             COALESCE(added_score.score, 0) * COALESCE(date_added_multiplier, 0) +
             COALESCE(released_score.score, 0) * COALESCE(date_released_multiplier, 0) AS score
      FROM (SELECT track_id,
                   user__track_heard,
                   label_score,
                   artist_score,
                   track_added,
                   (SELECT user_track_score_weight_multiplier
                    FROM user_score_weights
                    WHERE user_track_score_weight_code = 'label'
                   ) AS label_multiplier,
                   (SELECT user_track_score_weight_multiplier
                    FROM user_score_weights
                    WHERE user_track_score_weight_code = 'artist'
                   ) AS artist_multiplier,
                   (SELECT user_track_score_weight_multiplier
                    FROM user_score_weights
                    WHERE user_track_score_weight_code = 'date_added'
                   ) AS date_added_multiplier,
                   (SELECT user_track_score_weight_multiplier
                    FROM user_score_weights
                    WHERE user_track_score_weight_code = 'date_released'
                   ) AS date_released_multiplier
            FROM new_tracks
                     NATURAL JOIN label_scores
                     NATURAL JOIN artist_scores
           ) AS tracks
             LEFT JOIN track_date_added_score AS added_score USING (track_id)
             LEFT JOIN track_date_released_score AS released_score USING (track_id)
      ORDER BY score DESC NULLS LAST
      LIMIT 200
    ),
  heard_tracks AS (
    SELECT
      track_id,
      user__track_heard,
      NULL :: NUMERIC AS score
    FROM user__track
    NATURAL JOIN logged_user
    WHERE user__track_heard IS NOT NULL
    ORDER BY user__track_heard DESC
    LIMIT 50
  ),
  limited_tracks AS (
    SELECT track_id, user__track_heard, score FROM new_tracks_with_scores
    UNION ALL
    SELECT track_id, user__track_heard, score FROM heard_tracks
  ),
  keys AS (
    SELECT
      lt.track_id,
      json_agg(json_build_object(
        'system', key_system_code,
        'key', key_name
      )) AS keys
    FROM limited_tracks lt
      NATURAL JOIN track__key
      NATURAL JOIN key_system
      NATURAL JOIN key_name
    GROUP BY 1
  ),
    authors AS (
      SELECT
        lt.track_id,
        json_agg(
            json_build_object('name', a.artist_name, 'id', a.artist_id)
        ) AS authors
      FROM limited_tracks lt
        JOIN track__artist ta ON (ta.track_id = lt.track_id AND ta.track__artist_role = 'author')
        JOIN artist a ON (a.artist_id = ta.artist_id)
      GROUP BY 1
  ),
    remixers AS (
      SELECT
        lt.track_id,
        json_agg(
            json_build_object('name', a.artist_name, 'id', a.artist_id)
        ) AS remixers
      FROM limited_tracks lt
        JOIN track__artist ta ON (ta.track_id = lt.track_id AND ta.track__artist_role = 'remixer')
        JOIN artist a ON (a.artist_id = ta.artist_id)
      GROUP BY 1
  ),
    previews AS (
      SELECT
        lt.track_id,
        json_agg(
          json_build_object(
            'format', store__track_preview_format,
            'url', ${apiURL} || '/stores/' || lower(store_name) || '/tracks/' || store__track_store_id || '/preview.mp3' ,
            'start_ms', store__track_preview_start_ms,
            'end_ms', store__track_preview_end_ms,
            'waveform', store__track_preview_waveform_url
          )
          ORDER BY store__track_preview_end_ms - store__track_preview_start_ms DESC NULLS LAST
        ) AS previews
      FROM limited_tracks lt
        NATURAL JOIN store__track
        NATURAL JOIN store__track_preview
        NATURAL LEFT JOIN store__track_preview_waveform
        NATURAL JOIN store
      GROUP BY 1
  ),
  store_tracks AS (
      SELECT distinct on (lt.track_id, store_id)
        track_id,
        store_id,
        store__track_id,
        store__track_released,
        store__track_url,
        store_name,
        store__track_store_id,
        store__release_url
      FROM limited_tracks lt
        NATURAL JOIN store__track
        NATURAL JOIN store
        NATURAL LEFT JOIN release__track
        NATURAL LEFT JOIN release
        NATURAL LEFT JOIN store__release
  ),
    stores AS (
      SELECT
        track_id,
        min(store__track_released) as release_date,
        json_agg(
            json_build_object(
                'name', store_name,
                'code', lower(store_name),
                'id', store_id,
                'trackId', store__track_store_id,
                'url', store__track_url,
                'release', json_build_object('url', store__release_url)
            )
        ) AS stores
      FROM store_tracks
      GROUP BY 1
  ),
  labels AS (
    SELECT
        track_id,
        json_agg(json_build_object('name', label_name, 'id', label_id)) AS labels
      FROM limited_tracks
      NATURAL JOIN track__label
      NATURAL JOIN label
      GROUP BY 1
  ),
  tracks_with_details AS (
SELECT
  lt.track_id           AS id,
  track_title           AS title,
  user__track_heard     AS heard,
  track_duration_ms     AS duration,
  track_added           AS added,
  authors.authors       AS artists,
  track_version         AS version,
  CASE WHEN labels.labels IS NULL
    THEN '[]' :: JSON
  ELSE labels.labels END AS labels,
  CASE WHEN remixers.remixers IS NULL
    THEN '[]' :: JSON
  ELSE remixers.remixers END AS remixers,
  CASE WHEN keys.keys IS NULL
    THEN '[]' :: JSON
  ELSE keys.keys END AS keys,
  previews.previews as previews,
  stores.stores,
  stores.release_date AS released,
  score
FROM limited_tracks lt
  NATURAL JOIN track
  NATURAL JOIN authors
  NATURAL JOIN previews
  NATURAL JOIN stores
  NATURAL LEFT JOIN labels
  NATURAL LEFT JOIN remixers
  NATURAL LEFT JOIN keys
  ),
  new_tracks_with_details AS (
    SELECT json_agg(t) AS new_tracks FROM (
      SELECT * FROM tracks_with_details WHERE heard IS NULL ORDER BY score DESC NULLS LAST, added DESC
    ) t
  ),
  heard_tracks_with_details AS (
    SELECT json_agg(t) AS heard_tracks FROM (
      SELECT * FROM tracks_with_details WHERE heard IS NOT NULL ORDER BY heard DESC
    ) t
  )
  SELECT
    json_build_object(
      'new', CASE WHEN new_tracks IS NULL THEN '[]'::JSON ELSE new_tracks END,
      'heard', CASE WHEN heard_tracks IS NULL THEN '[]'::JSON ELSE heard_tracks END
    ) as tracks,
    json_build_object(
      'total', total,
      'new', new
    ) as meta
  FROM
    new_tracks_with_details,
    heard_tracks_with_details,
    user_tracks_meta
`
    )
    .then(R.head)

module.exports.addArtistOnLabelToIgnore = (tx, artistId, labelId, username) =>
  tx.queryAsync(
    // language=PostgreSQL
    sql`
INSERT INTO user__artist__label_ignore
(meta_account_user_id, artist_id, label_id)
SELECT
  meta_account_user_id,
  ${artistId},
  ${labelId}
FROM meta_account
where meta_account_username = ${username}
ON CONFLICT ON CONSTRAINT user__artist__label_ignore_unique DO NOTHING
`
  )

module.exports.setTrackHeard = (trackId, username, heard) =>
  pg.queryRowsAsync(
    sql`
UPDATE user__track
SET user__track_heard = ${heard ? 'now()' : null}
WHERE
  track_id = ${trackId} AND
  meta_account_user_id = (SELECT meta_account_user_id FROM meta_account WHERE meta_account_username = ${username})
`
  )

module.exports.setAllHeard = (username, heard) =>
  pg.queryAsync(
    sql`
UPDATE user__track
SET user__track_heard = ${heard ? 'NOW()' : null}
WHERE
  meta_account_user_id = (SELECT meta_account_user_id FROM meta_account WHERE meta_account_username = ${username})
    `
  )

module.exports.addTrackToUser = async (tx, userId, trackId) => {
  await tx.queryAsync(sql`INSERT INTO user__track (track_id, meta_account_user_id)
VALUES (${trackId}, ${userId})
ON CONFLICT ON CONSTRAINT user__track_track_id_meta_account_user_id_key DO NOTHING
`)
}

module.exports.deletePlaylistFollowFromUser = async (userId, playlistId) => {
  const res = await pg.queryAsync(
    // language=PostgreSQL
    sql`DELETE
FROM user__playlist_watch
WHERE meta_account_user_id = ${userId}
  AND playlist_id = ${playlistId}`
  )

  console.log(res)
}
