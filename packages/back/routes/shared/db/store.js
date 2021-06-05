const pg = require('../../../db/pg.js')
const R = require('ramda')
const sql = require('sql-template-strings')
const logger = require('../../../logger')(__filename)

module.exports.queryStoreId = storeName =>
  pg
    .queryRowsAsync(
      //language=PostgreSQL
      sql`-- queryStoreId
SELECT
  store_id
FROM store
WHERE
  store_name = ${storeName}`
    )
    .then(([{ store_id }]) => store_id)

module.exports.queryStoreRegexes = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryStoreRegexes
SELECT
  store_id          AS id
, LOWER(store_name) AS name
, store_url         AS url
, json_build_object(
      'artist', store_artist_regex,
      'label', store_label_regex,
      'playlist', json_agg(
          json_build_object(
              'typeId', store_playlist_type_store_id,
              'regex', store_playlist_type_regex
            )
        )
    )               AS regex
FROM
  store
  NATURAL JOIN store_playlist_type
GROUP BY
  1, 2, 3, store_artist_regex, store_label_regex`
  )

const getFieldFromResult = field => R.path([0, field])

module.exports.ensureLabelExists = async (tx, storeUrl, label, sourceId) => {
  const getLabelIdFromResult = getFieldFromResult('label_id')
  let labelId = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- ensureLabelExists SELECT label_id
SELECT
  label_id
FROM label
WHERE
  LOWER(label_name) = LOWER(${label.name})
`
    )
    .then(getLabelIdFromResult)

  if (!labelId) {
    logger.info(`Label ${label.name} not found, inserting`)
    labelId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- ensureLabelExists INSERT INTO label
INSERT INTO label
  (label_name, label_source)
VALUES
  (${label.name}, ${sourceId})
RETURNING label_id
`
      )
      .then(getLabelIdFromResult)
  }

  await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- ensureLabelExists INSERT INTO store__label
INSERT INTO store__label
  (store__label_store_id, store__label_url, store_id, label_id, store__label_source)
SELECT
  ${label.id}
, ${label.url}
, store_id
, ${labelId}
, ${sourceId}
FROM store
WHERE
  store_url = ${storeUrl}
ON CONFLICT ON CONSTRAINT store__label_store__label_store_id_store_id_key
  DO UPDATE SET
  store__label_url = COALESCE(store__label.store__label_url, excluded.store__label_url)
`
  )

  const res = await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- ensureArtistExists SELECT store__label_id AS "storeLabelId" FROM store__label
SELECT
  store__label_id AS "storeLabelId"
FROM
  store__label
  NATURAL JOIN store
WHERE
    store_url = ${storeUrl}
AND label_id = ${labelId}
  `
  )

  logger.debug('res', { res })

  const [{ storeLabelId }] = res

  return { labelId, storeLabelId }
}

module.exports.ensureReleaseExists = async (tx, storeUrl, release, sourceId) => {
  const getReleaseIdFromResult = getFieldFromResult('release_id')

  let releaseId = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- ensureReleaseExists SELECT release_id
SELECT
  release_id
FROM
  store__release
  NATURAL JOIN store
WHERE
    store_url = ${storeUrl}
AND (store__release_store_id = ${release.id} OR store__release_url = ${release.url})
`
    )
    .then(getReleaseIdFromResult)

  if (!releaseId) {
    releaseId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- ensureReleaseExists SELECT release_id
SELECT
  release_id
FROM release
WHERE
  LOWER(release_name) = LOWER(${release.title})
`
      )
      .then(getReleaseIdFromResult)
  }

  if (!releaseId) {
    releaseId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- ensureReleaseExists INSERT INTO release
INSERT INTO release
  (release_name, release_source)
VALUES
  (${release.title}, ${sourceId})
RETURNING release_id
`
      )
      .then(getReleaseIdFromResult)
  }

  await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- ensureReleaseExists INSERT INTO store__release
INSERT INTO store__release
  (store__release_store_id, store__release_url, store_id, release_id, store__release_source)
SELECT
  ${release.id}
, ${release.url}
, store_id
, ${releaseId}
, ${sourceId}
FROM store
WHERE
  store_url = ${storeUrl}
ON CONFLICT ON CONSTRAINT store__release_store_id_store__release_store_id_key
  DO UPDATE SET
              store__release_url = ${release.url}
            , release_id         = ${releaseId}
`
  )

  return releaseId
}

module.exports.ensureArtistExists = async (tx, storeUrl, artist, sourceId) => {
  const getArtistIdFromResult = getFieldFromResult('artist_id')

  let artistId = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- ensureArtistExists SELECT artist_id
SELECT
  artist_id
FROM
  store__artist
  NATURAL JOIN store
WHERE
    store_url = ${storeUrl}
AND (store__artist_store_id = ${artist.id} OR store__artist_url = ${artist.url}) -- TODO: add name matching for bandcamp support?
`
    )
    .then(getArtistIdFromResult)

  if (!artistId) {
    logger.info(`Artist ${artist.name} not found with id, trying with name`)
    artistId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- ensureArtistExists SELECT artist_id
SELECT
  artist_id
FROM
  artist
WHERE
    LOWER(artist_name) = LOWER(${artist.name})
`
      )
      .then(getArtistIdFromResult)
  }

  if (!artistId) {
    logger.info(`Artist ${artist.name} not found, inserting`)
    artistId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- ensureArtistExists INSERT INTO artist
INSERT INTO artist
  (artist_name, artist_source)
VALUES
  (${artist.name}, ${sourceId})
RETURNING artist_id
`
      )
      .then(getArtistIdFromResult)
  }

  await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- ensureArtistExists INSERT INTO store__artist
INSERT INTO store__artist
  (store__artist_store_id, store__artist_url, store_id, artist_id, store__artist_source)
SELECT
  ${artist.id}
, ${artist.url}
, store_id
, ${artistId}
, ${sourceId}
FROM store
WHERE
  store_url = ${storeUrl}
ON CONFLICT ON CONSTRAINT store__artist_store__artist_store_id_store_id_key DO UPDATE
  SET
    store__artist_url      = ${artist.url}
  , store__artist_store_id = ${artist.id}
  , store__artist_source   = ${sourceId}

`
  )

  const [{ storeArtistId }] = await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- ensureArtistExists SELECT store__artist_id AS "storeArtistId" FROM store__artist
SELECT
  store__artist_id AS "storeArtistId"
FROM
  store__artist
  NATURAL JOIN store
WHERE
    store_url = ${storeUrl}
AND artist_id = ${artistId}
  `
  )

  return { id: artistId, storeArtistId, role: artist.role }
}

module.exports.addStoreTrack = async (tx, storeUrl, labelId, releaseId, artists, track, sourceId) => {
  const getTrackIdFromResult = getFieldFromResult('track_id')

  const sortedArtists = R.sortBy(R.prop('id'), artists)

  let trackId = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack SELECT track_id 1
SELECT
  track_id
FROM
  track
  NATURAL JOIN store__track
WHERE
  store__track_store_id = ${track.id}`
    )
    .then(getTrackIdFromResult)

  if (!trackId) {
    logger.info('Track not found with id, searching with name')
    trackId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- addStoreTrack SELECT track_id 2
SELECT
  track_id
FROM
  track
  NATURAL JOIN track__artist
  NATURAL JOIN artist
WHERE
    LOWER(track_title) = LOWER(${track.title})
AND (${track.version}::TEXT IS NULL OR LOWER(track_version) = LOWER(${track.version}))
GROUP BY
  track_id
HAVING
    ARRAY_AGG(artist_id ORDER BY artist_id) = ${R.pluck('id', sortedArtists)}
AND ARRAY_AGG(track__artist_role ORDER BY artist_id) = ${R.pluck('role', sortedArtists)}
`
      )
      .then(getTrackIdFromResult)
  }

  if (!trackId) {
    logger.info('Track not found, inserting')
    trackId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- addStoreTrack INSERT INTO track
INSERT INTO track
  (track_title, track_version, track_duration_ms, track_source)
VALUES
  (${track.title}, ${track.version}, ${track.duration_ms}, ${sourceId})
RETURNING track_id
`
      )
      .then(getTrackIdFromResult)

    logger.info(`Inserted new track with id: ${trackId}`)
  } else {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack UPDATE track
UPDATE track
SET
  track_duration_ms = COALESCE(track_duration_ms, ${track.duration_ms})
WHERE
  track_id = ${trackId}
`
    )
  }

  for (const { id, role } of artists) {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack INSERT INTO track__artist
INSERT INTO track__artist
  (track_id, artist_id, track__artist_role)
VALUES
  (${trackId}, ${id}, ${role})
ON CONFLICT ON CONSTRAINT track__artist_track_id_artist_id_track__artist_role_key DO NOTHING
`
    )
  }

  const storeId = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack SELECT store_id
SELECT
  store_id
FROM store
WHERE
  store_url = ${storeUrl}
`
    )
    .then(getFieldFromResult('store_id'))

  await tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- addStoreTrack INSERT INTO store__track
INSERT INTO store__track
  (track_id,
   store_id,
   store__track_store_id,
   store__track_url,
   store__track_released,
   store__track_published,
   store__track_store_details,
   store__track_source)
VALUES
  (${trackId}, ${storeId}, ${track.id}, ${track.url}, ${track.released}, ${track.published}, ${track}, ${sourceId})
ON CONFLICT ON CONSTRAINT store__track_store__track_store_id_store_id_track_id_key
  DO UPDATE
  SET
    store__track_url           = ${track.url}
  , store__track_released      = ${track.released}
  , store__track_published     = ${track.published}
  , store__track_store_details = ${track}
`
  )

  const storeTrackId = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack SELECT store__track_id
SELECT
  store__track_id
FROM store__track
WHERE
    store_id = ${storeId}
AND track_id = ${trackId}
AND store__track_store_id = ${track.id}
`
    )
    .then(getFieldFromResult('store__track_id'))

  for (const preview of track.previews) {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack INSERT INTO store__track_preview
INSERT INTO store__track_preview
  (store__track_id,
   store__track_preview_url,
   store__track_preview_format,
   store__track_preview_start_ms,
   store__track_preview_end_ms,
   store__track_preview_source)
VALUES
  (${storeTrackId}, ${preview.url}, ${preview.format}, ${preview.start_ms}, ${preview.end_ms}, ${sourceId})
ON CONFLICT ON CONSTRAINT store__track_preview_store__track_id_preview_url_key
  DO UPDATE
  SET
    store__track_preview_end_ms   = COALESCE(excluded.store__track_preview_end_ms, ${preview.end_ms})
  , store__track_preview_start_ms = COALESCE(excluded.store__track_preview_start_ms, ${preview.start_ms})
`
    )
    const previewId = await tx
      .queryRowsAsync(
        // language=PostgreSQL
        sql`-- addStoreTrack SELECT store__track_preview_id
SELECT
  store__track_preview_id
FROM store__track_preview
WHERE
    store__track_preview_url = ${preview.url}
AND store__track_id = ${storeTrackId}
`
      )
      .then(getFieldFromResult('store__track_preview_id'))

    if (track.waveform) {
      await tx.queryAsync(
        // language=PostgreSQL
        sql`-- addStoreTrack INSERT INTO store__track_preview_waveform
INSERT INTO store__track_preview_waveform
  (store__track_preview_id, store__track_preview_waveform_url, store__track_preview_waveform_source)
VALUES
  (${previewId}, ${track.waveform.url}, ${sourceId})
ON CONFLICT ON CONSTRAINT store__track_preview_waveform_store__track_preview_id_url_key DO NOTHING
`
      )
    }
  }

  if (releaseId) {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack INSERT INTO release__track
INSERT INTO release__track
  (release_id, track_id)
VALUES
  (${releaseId}, ${trackId})
ON CONFLICT ON CONSTRAINT release__track_release_id_track_id_key DO NOTHING
`
    )
  }

  if (labelId) {
    // TODO: associate label to release instead of track?
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack INSERT INTO track__label
INSERT INTO track__label
  (track_id, label_id)
VALUES
  (${trackId}, ${labelId})
ON CONFLICT ON CONSTRAINT track__label_track_id_label_id_key DO NOTHING
`
    )
  }

  if (track.key) {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- addStoreTrack INSERT INTO track__key
INSERT INTO track__key
  (track_id, key_id, track__key_source)
SELECT
  ${trackId}
, key_id
, ${sourceId}
FROM key_name
WHERE
  key_name = ${track.key}
ON CONFLICT ON CONSTRAINT track__key_track_id_key_id_key DO NOTHING
`
    )
  }

  return trackId
}

module.exports.queryFollowRegexes = store =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryFollowRegexes
SELECT
  regex
, type
FROM
  ((SELECT store_name, store_artist_regex AS regex, 'artist' AS type FROM store)
   UNION ALL
   (SELECT store_name, store_label_regex AS regex, 'label' AS type FROM store)
   UNION ALL
   (SELECT
      store_name
    , store_playlist_type_regex                          AS regex
    , coalesce(store_playlist_type_store_id, 'playlist') AS type
    FROM
      store
      NATURAL JOIN store_playlist_type
    ORDER BY store_playlist_type_priority)) AS a
WHERE
  store_name = ${store}
`
  )
