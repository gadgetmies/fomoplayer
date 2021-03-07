const pg = require('../../../db/pg.js')
const R = require('ramda')
const sql = require('sql-template-strings')

module.exports.queryStoreId = storeName =>
  pg
    .queryRowsAsync(
      //language=PostgreSQL
      sql`SELECT store_id
  FROM store
  WHERE store_name = ${storeName}`
    )
    .then(([{ store_id }]) => store_id)

module.exports.queryStores = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`SELECT store_id AS id, store_name AS name, store_url AS url, store_playlist_regex AS "playlistRegex"
FROM store`
  )

const getFieldFromResult = field => R.path([0, field])

module.exports.ensureLabelExists = async (tx, storeUrl, label) => {
  const getLabelIdFromResult = getFieldFromResult('label_id')

  let labelId = await tx
    .queryRowsAsync(
      sql`
SELECT label_id from label where LOWER(label_name) = LOWER(${label.name})
`
    )
    .then(getLabelIdFromResult)

  if (!labelId) {
    console.log(`Label ${label.name} not found, inserting`)
    labelId = await tx
      .queryRowsAsync(
        sql`insert into label (label_name)
values (${label.name})
returning label_id
`
      )
      .then(getLabelIdFromResult)
  }

  await tx.queryRowsAsync(sql`insert into store__label (store__label_store_id, store__label_url, store_id, label_id)
select ${label.id}, ${label.url}, store_id, ${labelId}
from store
where store_url = ${storeUrl}
ON CONFLICT ON CONSTRAINT store__label_store__label_store_id_store_id_key
    DO UPDATE SET store__label_url = COALESCE(store__label.store__label_url, EXCLUDED.store__label_url)
`)

  return labelId
}

module.exports.ensureReleaseExists = async (tx, storeUrl, release) => {
  const getReleaseIdFromResult = getFieldFromResult('release_id')

  let releaseId = await tx
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
    releaseId = await tx
      .queryRowsAsync(
        sql`
SELECT release_id from release where LOWER(release_name) = LOWER(${release.title})
`
      )
      .then(getReleaseIdFromResult)
  }

  if (!releaseId) {
    releaseId = await tx
      .queryRowsAsync(
        sql`insert into release (release_name)
values (${release.title})
returning release_id
`
      )
      .then(getReleaseIdFromResult)
  }

  await tx.queryRowsAsync(sql`
INSERT INTO store__release (store__release_store_id, store__release_url, store_id, release_id)
SELECT ${release.id}, ${release.url}, store_id, ${releaseId}
FROM store
WHERE store_url = ${storeUrl}
ON CONFLICT ON CONSTRAINT store__release_store_id_store__release_store_id_key
DO UPDATE SET store__release_url = ${release.url}, release_id = ${releaseId}
`)

  return releaseId
}

module.exports.ensureArtistExists = async (tx, storeUrl, artist) => {
  const getArtistIdFromResult = getFieldFromResult('artist_id')

  let artistId = await tx
    .queryRowsAsync(
      // language=PostgreSQL
      sql`
SELECT artist_id
FROM store__artist
NATURAL JOIN store
WHERE store_url = ${storeUrl} AND (store__artist_store_id = ${artist.id} OR store__artist_url = ${artist.url})
`
    )
    .then(getArtistIdFromResult)

  if (!artistId) {
    console.log(`Artist ${artist.name} not found with id, trying with name`)
    artistId = await tx
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
    console.log(`Artist ${artist.name} not found, inserting`)
    artistId = await tx
      .queryRowsAsync(
        sql`
INSERT INTO artist (artist_name)
VALUES (${artist.name})
RETURNING artist_id
`
      )
      .then(getArtistIdFromResult)

    await tx.queryRowsAsync(sql`
INSERT INTO store__artist (store__artist_store_id, store__artist_url, store_id, artist_id)
SELECT ${artist.id}, ${artist.url}, store_id, ${artistId}
FROM store
WHERE store_url = ${storeUrl}
ON CONFLICT ON CONSTRAINT store__artist_store__artist_store_id_store_id_key DO NOTHING
`)
  }

  return { id: artistId, role: artist.role }
}

module.exports.addStoreTrack = async (tx, storeUrl, labelId, releaseId, artists, track) => {
  const getTrackIdFromResult = getFieldFromResult('track_id')

  const sortedArtists = R.sortBy(R.prop('id'), artists)

  let trackId = await tx
    .queryRowsAsync(
      sql`
SELECT track_id FROM track NATURAL JOIN store__track WHERE store__track_store_id = ${track.id}`
    )
    .then(getTrackIdFromResult)

  if (!trackId) {
    console.log('Track not found with id, searching with name')
    trackId = await tx
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
    console.log('Track not found, inserting')
    trackId = await tx
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
    await tx.queryAsync(sql`
UPDATE track SET track_duration_ms = COALESCE(track_duration_ms, ${track.duration_ms}) WHERE track_id = ${trackId}
`)
  }

  for (const { id, role } of artists) {
    await tx.queryAsync(sql`
INSERT INTO track__artist (track_id, artist_id, track__artist_role) VALUES (${trackId}, ${id}, ${role})
ON CONFLICT ON CONSTRAINT track__artist_track_id_artist_id_track__artist_role_key DO NOTHING
      `)
  }

  const storeId = await tx
    .queryRowsAsync(
      sql`
SELECT store_id FROM store WHERE store_url = ${storeUrl}
`
    )
    .then(getFieldFromResult('store_id'))

  await tx.queryRowsAsync(
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

  const storeTrackId = await tx
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
  for (const preview of track.previews) {
    await tx.queryAsync(sql`
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
    const previewId = await tx
      .queryRowsAsync(
        sql`
SELECT store__track_preview_id FROM store__track_preview 
WHERE store__track_preview_url = ${preview.url} AND
      store__track_id = ${storeTrackId}
`
      )
      .then(getFieldFromResult('store__track_preview_id'))

    if (track.waveform) {
      await tx.queryAsync(sql`
INSERT INTO store__track_preview_waveform (store__track_preview_id, store__track_preview_waveform_url)
VALUES (${previewId}, ${track.waveform.url})
ON CONFLICT ON CONSTRAINT store__track_preview_waveform_store__track_preview_id_url_key DO NOTHING
`)
    }
  }

  if (releaseId) {
    await tx.queryAsync(sql`
INSERT INTO release__track (release_id, track_id) VALUES (${releaseId}, ${trackId})
ON CONFLICT ON CONSTRAINT release__track_release_id_track_id_key DO NOTHING
`)
  }

  if (labelId) {
    // TODO: associate label to release instead of track?
    await tx.queryAsync(sql`
INSERT INTO track__label (track_id, label_id) VALUES (${trackId}, ${labelId})
ON CONFLICT ON CONSTRAINT track__label_track_id_label_id_key DO NOTHING
`)
  }

  if (track.key) {
    await tx.queryAsync(sql`INSERT INTO track__key (track_id, key_id)
SELECT ${trackId}, key_id
FROM key_name
WHERE key_name = ${track.key}
ON CONFLICT ON CONSTRAINT track__key_track_id_key_id_key DO NOTHING
`)
  }

  return trackId
}
