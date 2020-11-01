const pg = require('../db/pg.js')
const sql = require('sql-template-strings')
const R = require('ramda')

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
    WHERE user__track_heard IS NULL AND 
          track_id NOT IN (SELECT track_id FROM user_purchased_tracks)
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
      ORDER BY score DESC
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
            'url', store__track_preview_url,
            'start_ms', store__track_preview_start_ms,
            'end_ms', store__track_preview_end_ms,
            'waveform', store__track_preview_waveform_url
          )
          ORDER BY store__track_preview_end_ms - store__track_preview_start_ms DESC
        ) AS previews
      FROM limited_tracks lt
        NATURAL JOIN store__track
        NATURAL JOIN store__track_preview
        NATURAL LEFT JOIN store__track_preview_waveform
      GROUP BY 1
  ),
  store_tracks AS (
      SELECT distinct on (lt.track_id, store_id)
        track_id,
        store_id,
        store__track_id,
        store__track_released,
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
                'url', store__release_url
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
      SELECT * FROM tracks_with_details WHERE heard IS NULL ORDER BY score DESC, added DESC
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

module.exports.getLongestPreviewForTrack = (id, format, skip) =>
  pg
    .queryRowsAsync(
      sql`
    SELECT store__track_id AS "storeTrackId" , lower(store_name) AS "storeCode"
    FROM
      store__track_preview NATURAL JOIN
      store__track  NATURAL JOIN
      store
    WHERE track_id = ${id} AND store__track_preview_format = ${format}
    ORDER BY store__track_preview_end_ms - store__track_preview_start_ms DESC
    OFFSET ${skip}
    LIMIT 1;
    `
    )
    .then(R.head)

module.exports.getTrackIdForStoreTrack = (storeUrl, id, url) =>
  pg
    .queryRowsAsync(
      sql`SELECT track_id
from track
         natural join store__track
         natural join store
where store_url = ${storeUrl}
  and (store__track_store_id = ${id} OR store__track_url = ${url})
`
    )
    .then(R.path([0, 'track_id']))

module.exports.addTrackToUser = (userId, trackId) =>
  pg.queryAsync(sql`INSERT INTO user__track (track_id, meta_account_user_id)
VALUES (${trackId}, ${userId})
ON CONFLICT ON CONSTRAINT user__track_track_id_meta_account_user_id_key DO NOTHING
`)

const getFieldFromResult = field => R.path([0, field])

module.exports.ensureLabelExists = async (storeUrl, label) => {
  const getLabelIdFromResult = getFieldFromResult('label_id')

  let labelId = await pg
    .queryRowsAsync(
      sql`
SELECT label_id from label where LOWER(label_name) = LOWER(${label.name})
`
    )
    .then(getLabelIdFromResult)

  if (!labelId) {
    labelId = await pg
      .queryRowsAsync(
        sql`insert into label (label_name)
values (${label.name})
returning label_id
`
      )
      .then(getLabelIdFromResult)
  }

  await pg.queryRowsAsync(sql`insert into store__label (store__label_store_id, store__label_url, store_id, label_id)
select ${label.id}, ${label.url}, store_id, ${labelId}
from store
where store_url = ${storeUrl}
ON CONFLICT ON CONSTRAINT store__label_store__label_store_id_store_id_key
    DO UPDATE SET store__label_url = COALESCE(store__label.store__label_url, EXCLUDED.store__label_url)
`)

  return labelId
}

module.exports.ensureReleaseExists = async (storeUrl, release) => {
  const getReleaseIdFromResult = getFieldFromResult('release_id')

  let releaseId = await pg
    .queryRowsAsync(
      sql`SELECT release_id
from store__release
         natural join store
where store_url = ${storeUrl}
  and (store__release_store_id = ${release.id} or store__release_url = ${release.url})
`
    )
    .then(getReleaseIdFromResult)

  if (!releaseId) {
    releaseId = await pg
      .queryRowsAsync(
        sql`
SELECT release_id from release where LOWER(release_name) = LOWER(${release.title})
`
      )
      .then(getReleaseIdFromResult)
  }

  if (!releaseId) {
    releaseId = await pg
      .queryRowsAsync(
        sql`insert into release (release_name)
values (${release.title})
returning release_id
`
      )
      .then(getReleaseIdFromResult)
  }

  await pg.queryRowsAsync(sql`
INSERT INTO store__release (store__release_store_id, store__release_url, store_id, release_id)
SELECT ${release.id}, ${release.url}, store_id, ${releaseId}
FROM store
WHERE store_url = ${storeUrl}
ON CONFLICT ON CONSTRAINT store__release_store_id_store__release_store_id_key
DO UPDATE SET store__release_url = ${release.url}, release_id = ${releaseId}
`)

  return releaseId
}

module.exports.ensureArtistExists = async (storeUrl, artist) => {
  const getArtistIdFromResult = getFieldFromResult('artist_id')

  let artistId = await pg
    .queryRowsAsync(
      sql`
SELECT artist_id
FROM store__artist
NATURAL JOIN store
WHERE store_url = ${storeUrl} AND (store__artist_store_id = ${artist.id} OR store__artist_url = ${artist.url})
`
    )
    .then(getArtistIdFromResult)

  if (!artistId) {
    artistId = await pg
      .queryRowsAsync(
        sql`
SELECT artist_id
FROM artist
         NATURAL JOIN store__artist
         NATURAL JOIN store
WHERE LOWER(artist_name) = LOWER(${artist.name})
  AND store_url <> ${storeUrl}
`
      )
      .then(getArtistIdFromResult)
  }

  if (!artistId) {
    artistId = await pg
      .queryRowsAsync(
        sql`
INSERT INTO artist (artist_name)
VALUES (${artist.name})
RETURNING artist_id
`
      )
      .then(getArtistIdFromResult)

    await pg.queryRowsAsync(sql`
INSERT INTO store__artist (store__artist_store_id, store__artist_url, store_id, artist_id)
SELECT ${artist.id}, ${artist.url}, store_id, ${artistId}
FROM store
WHERE store_url = ${storeUrl}
ON CONFLICT ON CONSTRAINT store__artist_store__artist_store_id_store_id_key DO NOTHING
`)
  }

  return { id: artistId, role: artist.role }
}

module.exports.addStoreTrack = async (storeUrl, labelId, releaseId, artists, track) => {
  const getTrackIdFromResult = getFieldFromResult('track_id')

  const sortedArtists = R.sortBy(R.prop('id'), artists)

  let trackId = await pg
    .queryRowsAsync(
      sql`
SELECT track_id FROM track NATURAL JOIN store__track WHERE store__track_store_id = ${track.id}`
    )
    .then(getTrackIdFromResult)

  if (!trackId) {
    trackId = await pg
      .queryRowsAsync(
        sql`SELECT track_id
from track natural join track__artist natural join artist
where LOWER(track_title) = LOWER(${track.title}) AND
      (${track.version}::TEXT IS NULL OR LOWER(track_version) = LOWER(${track.version}))
GROUP BY track_id
HAVING ARRAY_AGG(artist_id ORDER BY artist_id) = ${R.pluck('id', sortedArtists)} AND
       ARRAY_AGG(track__artist_role ORDER BY artist_id) = ${R.pluck('role', sortedArtists)}
`
      )
      .then(getTrackIdFromResult)
  }

  if (!trackId) {
    trackId = await pg
      .queryRowsAsync(
        sql`
INSERT INTO track (track_title, track_version, track_duration_ms)
VALUES (${track.title}, ${track.version}, ${track.duration_ms})
RETURNING track_id
`
      )
      .then(getTrackIdFromResult)

    console.log(`Inserted new track with id: ${trackId}`)
  } else {
    console.log(`Updating duration of track ${trackId} to ${track.duration_ms} if null`)
    await pg.queryAsync(sql`
UPDATE track SET track_duration_ms = COALESCE(track_duration_ms, ${track.duration_ms}) WHERE track_id = ${trackId}
`)
  }

  for (const { id, role } of artists) {
    await pg.queryAsync(sql`
INSERT INTO track__artist (track_id, artist_id, track__artist_role) VALUES (${trackId}, ${id}, ${role})
ON CONFLICT ON CONSTRAINT track__artist_track_id_artist_id_track__artist_role_key DO NOTHING
      `)
  }

  const storeId = await pg
    .queryRowsAsync(
      sql`
SELECT store_id FROM store WHERE store_url = ${storeUrl}
`
    )
    .then(getFieldFromResult('store_id'))

  await pg.queryRowsAsync(
    sql`INSERT INTO store__track
(track_id, store_id, store__track_store_id, store__track_url, store__track_released, store__track_published, store__track_store_details)
VALUES (${trackId}, ${storeId}, ${track.id}, ${track.url}, ${track.released}, ${track.published}, ${track})
ON CONFLICT ON CONSTRAINT store__track_store__track_store_id_store_id_track_id_key DO UPDATE SET
store__track_url = ${track.url},
store__track_released = ${track.released},
store__track_published = ${track.published},
store__track_store_details = ${track}
`
  )

  const storeTrackId = await pg
    .queryRowsAsync(
      sql`
SELECT store__track_id FROM store__track 
WHERE store_id = ${storeId} AND
      track_id = ${trackId} AND
      store__track_store_id = ${track.id}
    `
    )
    .then(getFieldFromResult('store__track_id'))

  // TODO: Make waveforms preview independent? (to make them available for tracks from stores without waveforms)
  await Promise.all(
    track.previews.map(async preview => {
      await pg.queryAsync(sql`
INSERT INTO store__track_preview
(store__track_id, store__track_preview_url, store__track_preview_format, store__track_preview_start_ms,
 store__track_preview_end_ms)
values (${storeTrackId}, ${preview.url}, ${preview.format}, ${preview.start_ms}, ${preview.end_ms})
ON CONFLICT ON CONSTRAINT store__track_preview_store__track_id_preview_url_key DO 
    UPDATE SET
      store__track_preview_end_ms = COALESCE(EXCLUDED.store__track_preview_end_ms, ${preview.end_ms}),
      store__track_preview_start_ms = COALESCE(EXCLUDED.store__track_preview_start_ms, ${preview.start_ms}),
      store__track_preview_format = COALESCE(EXCLUDED.store__track_preview_format, ${preview.format})
`)
      const previewId = await pg
        .queryRowsAsync(
          sql`
SELECT store__track_preview_id FROM store__track_preview 
WHERE store__track_preview_url = ${preview.url} AND
      store__track_id = ${storeTrackId}
`
        )
        .then(getFieldFromResult('store__track_preview_id'))

      if (track.waveform) {
        await pg.queryAsync(sql`
INSERT INTO store__track_preview_waveform (store__track_preview_id, store__track_preview_waveform_url)
VALUES (${previewId}, ${track.waveform.url})
ON CONFLICT ON CONSTRAINT store__track_preview_waveform_store__track_preview_id_url_key DO NOTHING
`)
      }
    })
  )

  if (releaseId) {
    await pg.queryAsync(sql`
INSERT INTO release__track (release_id, track_id) VALUES (${releaseId}, ${trackId})
ON CONFLICT ON CONSTRAINT release__track_release_id_track_id_key DO NOTHING
`)
  }

  if (labelId) {
    // TODO: associate label to release instead of track?
    await pg.queryAsync(sql`
INSERT INTO track__label (track_id, label_id) VALUES (${trackId}, ${labelId})
ON CONFLICT ON CONSTRAINT track__label_track_id_label_id_key DO NOTHING
`)
  }

  if (track.key) {
    await pg.queryAsync(sql`INSERT INTO track__key (track_id, key_id)
SELECT ${trackId}, key_id
FROM key_name
WHERE key_name = ${track.key}
ON CONFLICT ON CONSTRAINT track__key_track_id_key_id_key DO NOTHING
`)
  }

  return trackId
}

module.exports.addPurchasedTrackToUser = async (userId, storeTrackId) => {
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
    INSERT INTO user__store__track_purchased (meta_account_user_id, store__track_id)
    SELECT ${userId}, store__track_id FROM store__track WHERE store__track_store_id = ${storeTrackId}
    ON CONFLICT ON CONSTRAINT user__store__track_purchased_meta_account_user_id_store__tr_key DO NOTHING
    `
  )
}
