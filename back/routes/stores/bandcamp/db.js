const pg = require('../../../db/pg.js')
const R = require('ramda')
const sql =require('sql-template-strings')

module.exports.insertArtist = (tx, artistName) => tx.queryRowsAsync(
// language=PostgreSQL
  sql`-- insert new artists
INSERT INTO artist (artist_name)
  SELECT ${artistName}
  WHERE NOT EXISTS (
    SELECT 1
    FROM artist
    WHERE lower(artist_name) = lower(${artistName})
  )`)

module.exports.insertUserTrack = (tx, username, insertedTrackId) =>
  tx.queryRowsAsync(
// language=PostgreSQL
    sql`
INSERT INTO user__track (track_id, meta_account_user_id)
SELECT
${insertedTrackId},
meta_account_user_id
FROM meta_account
WHERE meta_account_username = ${username}
ON CONFLICT DO NOTHING
`)

module.exports.findNewTracks = (tx, storeId, tracks) =>
  tx.queryRowsAsync(
// language=PostgreSQL
    sql`-- find new tracks
SELECT track_id
FROM json_to_recordset(${JSON.stringify(tracks)} :: JSON) AS tracks(track_id TEXT)
WHERE track_id NOT IN (
  SELECT store__track_store_id
  FROM store__track
  WHERE store_id = ${storeId})`)

module.exports.insertTrackPreview = (tx, store__track_id, newStoreTrack) => tx.queryRowsAsync(
// language=PostgreSQL
  sql`
INSERT INTO store__track_preview
  (store__track_id, store__track_preview_format, store__track_preview_start_ms, store__track_preview_end_ms, store__track_preview_url)
  VALUES (
    ${store__track_id},
    'mp3',
    0,
    ${parseInt(newStoreTrack.duration * 1000, 10)},
    ''
  )
  RETURNING store__track_preview_id
`)

module.exports.insertTrackWaveform =
  (tx, store__track_id, waveforms) =>
    tx.queryRowsAsync(
// language=PostgreSQL
      sql`
INSERT INTO store__track_preview_waveform (store__track_preview_id, store__track_preview_waveform_url) select store__track_preview_id, ${waveforms.large.url} from store__track_preview where store__track_id = ${store__track_id}
    `)

module.exports.insertStoreTrack = (tx, storeId, trackId, trackStoreId, trackStoreDetails) => tx.queryRowsAsync(
// language=PostgreSQL
  sql`
INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_store_details, store__track_published, store__track_released)
VALUES (
  ${trackId},
  ${storeId},
  ${trackStoreId},
  ${JSON.stringify(trackStoreDetails)} :: JSONB,
  NOW(), -- TODO: How to get release and publish dates on bandcamp?
  NOW()
)
RETURNING store__track_id
`)

module.exports.insertNewTrackReturningTrackId = (tx, albumInfo, newStoreTrack) =>
  tx.queryRowsAsync(
// language=PostgreSQL
    sql`WITH
  authors AS (
      SELECT DISTINCT artist_id -- is distinct really needed?
      FROM store__artist
        NATURAL JOIN artist
        WHERE store__artist_store_id = (${albumInfo.band_id})
  ),
    exiting_track_details AS (
      SELECT
        t.track_id,
        t.track_title,
        t.track_mix,
        array_agg(DISTINCT a.artist_id
        ORDER BY a.artist_id) AS artists
      FROM track t
        LEFT JOIN track__artist ta ON (ta.track_id = t.track_id AND ta.track__artist_role = 'author')
        LEFT JOIN artist a ON (a.artist_id = ta.artist_id)
      WHERE
        track_title = ${newStoreTrack.title} AND
        a.artist_id IN (SELECT artist_id
                        FROM authors)
      GROUP BY 1, 2
  ),
    existing_track AS (
      SELECT track_id
      FROM exiting_track_details
      WHERE
        track_title = ${newStoreTrack.title} AND
        artists = (SELECT ARRAY(SELECT artist_id
                                FROM authors
                                ORDER BY artist_id))
  ),
    inserted_track AS (
    INSERT INTO track (track_title, track_mix, track_duration_ms)
      SELECT ${newStoreTrack.title}, '', ${parseInt(newStoreTrack.duration * 1000, 10)}
      WHERE NOT exists(SELECT 1
                       FROM existing_track)
    RETURNING track_id
  ),
    inserted_track_authors AS (
    INSERT INTO track__artist (track_id, artist_id, track__artist_role)
      SELECT
        track_id,
        artist_id,
        'author'
      FROM inserted_track, authors
      WHERE NOT EXISTS(SELECT 1
                       FROM existing_track)
  )

SELECT track_id
FROM inserted_track
UNION ALL (SELECT track_id as existing_id
           FROM existing_track)
`)

module.exports.insertStoreArtist = (tx, storeId, artistName, storeArtistId, storeArtistDetails) => tx.queryRowsAsync(
// language=PostgreSQL
  sql`
INSERT INTO store__artist (artist_id, store_id, store__artist_store_id, store__artist_store_details)
  SELECT
  artist_id,
  ${storeId},
  ${storeArtistId},
  ${storeArtistDetails} :: JSONB
  FROM artist
  WHERE lower(artist_name) = lower(${artistName})
`)

module.exports.isNewArtist = (tx, storeId, storeArtistId) => tx.queryRowsAsync(
// language=PostgreSQL
  sql`-- find new artists
SELECT ${storeArtistId} NOT IN (
  SELECT store__artist_store_id
  from store__artist
  WHERE store_id = ${storeId}
) as "isNew"
`)
    .then(R.head)
    .then(R.prop('isNew'))

const getStoreId = module.exports.getStoreId = () => pg.queryRowsAsync(
  //language=PostgreSQL
  sql` --getStoreId
SELECT store_id
  FROM store
  WHERE store_name = 'Bandcamp'`)
  .then(([{ store_id }]) => store_id)

module.exports.insertTrackToCart =
  (storeTrackId, cartName, username) => pg.queryRowsAsync(
// language=PostgreSQL
  sql`--insertTrackToCart
INSERT INTO store__track__cart
  SELECT
    ${storeTrackId} AS store__track_id,
    cart_id
  FROM cart
    NATURAL JOIN meta_account
  WHERE
    cart_name = ${cartName} AND
    meta_account_username = ${username}
  `
)

module.exports.queryTracksInCarts = username =>
  getStoreId()
    .then(storeId =>
      pg.queryRowsAsync(
        //language=PostgreSQL
        sql`-- queryItemsInCarts
SELECT coalesce(array_agg(track_id), ARRAY[] :: INT[]) as tracks_in_carts
FROM track
  NATURAL JOIN store__track
  NATURAL JOIN store__track__cart
  NATURAL JOIN cart
  NATURAL JOIN meta_account
where
  meta_account_username = ${username}
and store_id= ${storeId}
  `))
    .then(R.head)
    .then(R.prop('tracks_in_carts'))

module.exports.ensureAlbumExists = async (tx, storeId, storeAlbum) => {
  let releaseDetails = await tx.queryRowsAsync(sql`
    SELECT release_id FROM store__release WHERE store__release_url = ${storeAlbum.url}
  `)
  if (releaseDetails.length === 0) {
    releaseDetails = await tx.queryRowsAsync(sql`
      INSERT INTO release (release_name) VALUES (${storeAlbum.current.title})
      RETURNING release_id
    `)
  }
  await tx.queryRowsAsync(sql`
    INSERT INTO store__release (store_id, release_id, store__release_url, store__release_store_id)
    VALUES (${storeId}, ${releaseDetails[0].release_id}, ${storeAlbum.url}, ${storeAlbum.id})
    ON CONFLICT DO NOTHING
  `)

  return releaseDetails[0].release_id
}

module.exports.addTracksToAlbum = (tx, storeId, albumId, storeTrackIds) =>
  tx.queryRowsAsync(sql`
    INSERT INTO release__track (release_id, track_id)
      SELECT ${albumId}, store__track.track_id
      FROM store__track
      WHERE store__track_store_id = ANY(${storeTrackIds}) AND store_id = ${storeId}
    ON CONFLICT DO NOTHING
  `)

  module.exports.queryAlbumUrl = (storeId, storeTrackId) =>
    pg.queryRowsAsync(sql`
      SELECT store__release_url
      FROM store__release
      NATURAL JOIN release
      NATURAL JOIN release__track
      NATURAL JOIN store__track
      WHERE
        store__track_id = ${storeTrackId} AND
        store_id = ${storeId}
    `).then(([{store__release_url}]) => store__release_url)

module.exports.queryTrackStoreId = (trackId) =>
  pg.queryRowsAsync(sql`
  SELECT store__track_store_id FROM store__track WHERE store__track_id = ${trackId}
  `)
  .then(([{store__track_store_id}]) => store__track_store_id)
