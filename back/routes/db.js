const pg = require('../db/pg.js')
const SQL = require('sql-template-strings')
const R = require('ramda')

module.exports.queryUserTracks = username =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    SQL`WITH
    logged_user AS (
      SELECT meta_account_user_id
      FROM meta_account
      WHERE meta_account_username = ${username}
  ),
    user_tracks AS (
      SELECT
        track_id,
        track_title,
        user__track_heard,
        track_added,
        track_duration_ms,
        SUM(COALESCE(user_label_scores_score, 0)) + SUM(COALESCE(user_artist_scores_score, 0)) AS score
      FROM logged_user
        NATURAL JOIN user__track
        NATURAL JOIN track
        NATURAL JOIN track__artist
        NATURAL LEFT JOIN track__label
        NATURAL LEFT JOIN user_label_scores
        NATURAL LEFT JOIN user_artist_scores
      GROUP BY 1, 2, 3, 4, 5
  ),
  user_tracks_meta AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE user__track_heard IS NULL) as new
    FROM user_tracks
  ),
    authors AS (
      SELECT
        ut.track_id,
        json_agg(
            json_build_object('name', a.artist_name, 'id', a.artist_id)
        ) AS authors
      FROM user_tracks ut
        JOIN track__artist ta ON (ta.track_id = ut.track_id AND ta.track__artist_role = 'author')
        JOIN artist a ON (a.artist_id = ta.artist_id)
      GROUP BY 1
  ),
    remixers AS (
      SELECT
        ut.track_id,
        json_agg(
            json_build_object('name', a.artist_name, 'id', a.artist_id)
        ) AS remixers
      FROM user_tracks ut
        JOIN track__artist ta ON (ta.track_id = ut.track_id AND ta.track__artist_role = 'remixer')
        JOIN artist a ON (a.artist_id = ta.artist_id)
      GROUP BY 1
  ),
    previews AS (
      SELECT
        ut.track_id,
        json_agg(
          json_build_object(
            'format', store__track_preview_format,
            'url', store__track_preview_url,
            'start_ms', store__track_preview_start_ms,
            'end_ms', store__track_preview_end_ms,
            'track_duration_ms', store__track_preview_track_duration_ms,
            'waveform', store__track_preview_waveform_url
          )
        ) AS previews
      FROM user_tracks ut
        NATURAL JOIN store__track
        NATURAL JOIN store__track_preview
        NATURAL LEFT JOIN store__track_preview_waveform
      GROUP BY 1
  ),
  store_tracks AS (
      SELECT distinct on (ut.track_id, store_id)
        track_id,
        store_id,
        store__track_id,
        store__track_released,
        store_name,
        store__track_store_id,
        store__release_url
      FROM user_tracks ut
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
                'url', store__release_url
            )
        ) AS stores
      FROM store_tracks
      GROUP BY 1
  ),
  tracks AS (
SELECT
  distinct on (score, release_date, ut.track_id) -- TODO sort by lowest price
  ut.track_id       AS id,
  track_title       AS title,
  user__track_heard AS heard,
  track_duration_ms AS duration,
  json_build_object(
      'name', label_name,
      'id', label_id
  )                 AS label,
  authors.authors   AS artists,
  CASE WHEN remixers.remixers IS NULL
    THEN '[]' :: JSON
  ELSE remixers.remixers END,
  previews.previews as previews,
  stores.stores,
  stores.release_date,
  score

FROM user_tracks ut
  NATURAL LEFT JOIN track__label
  NATURAL LEFT JOIN label
  NATURAL JOIN authors
  NATURAL LEFT JOIN remixers
  NATURAL JOIN previews
  NATURAL JOIN stores

WHERE
  release_date > (now() - INTERVAL '10 days') OR
  user__track_heard IS NULL OR
  user__track_heard > (now() - INTERVAL '5 days')
ORDER BY score DESC, release_date DESC, ut.track_id
  ),
tracks_list AS (
select json_agg(tracks) as list
FROM tracks)

  SELECT
    CASE WHEN list IS NULL THEN '[]'::JSON ELSE list END as tracks,
    json_build_object(
      'total', total,
      'new', new
    ) as meta
  FROM
    tracks_list,
    user_tracks_meta
`).then(R.head)

module.exports.addArtistOnLabelToIgnore = (tx, artistId, labelId, username) =>
  tx.queryAsync(
    // language=PostgreSQL
    SQL`
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
    SQL`
UPDATE user__track
SET user__track_heard = ${heard ? 'now()' : null}
WHERE
  track_id = ${trackId} AND
  meta_account_user_id = (SELECT meta_account_user_id FROM meta_account WHERE meta_account_username = ${username})
`
  )

module.exports.getLongestPreviewForTrack = (id, format) =>
  pg.queryRowsAsync(
    SQL`
    SELECT store__track_id AS "storeTrackId" , lower(store_name) AS "storeCode"
    FROM
      store__track_preview NATURAL JOIN
      store__track  NATURAL JOIN
      store
    WHERE track_id = ${id} AND store__track_preview_format = ${format}
    ORDER BY store__track_preview_track_duration_ms DESC
    LIMIT 1;
    `
  ).then(R.head)
