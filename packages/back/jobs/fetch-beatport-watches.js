const pg = require('../db/pg.js')
const sql = require('sql-template-strings')
const BPromise = require('bluebird')
const bpApi = require('bp-api')
const { addStoreTrackToUsers } = require('../routes/users/logic.js')
const { beatportTracksTransform } = require('../../chrome-extension/src/js/transforms/beatport')

const bpApiStatic = BPromise.promisifyAll(bpApi.staticFns)

const fetchArtists = async function(jobId) {
  const source = { operation: 'beatport/fetchArtists', jobId }
  const errors = []
  const artistBeatportIds = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- fetchArtists SELECT store__artist_store_id
SELECT
  store__artist_store_id          AS id
, array_agg(meta_account_user_id) AS users
FROM
  store__artist_watch
  NATURAL JOIN store__artist
  NATURAL JOIN store__artist_watch__user
  NATURAL JOIN store
WHERE
    store_name = 'Beatport'
AND (store__artist_watch_last_update IS NULL OR store__artist_watch_last_update + INTERVAL '6 hours' < NOW())
GROUP BY
  1, store__artist_watch_last_update
ORDER BY
  store__artist_watch_last_update DESC NULLS FIRST
LIMIT 50
`
  )

  let count = 1
  for (const { id, users } of artistBeatportIds) {
    console.log(`Fetching tracks for artist ${count}/${artistBeatportIds.length}`)
    count++

    try {
      const artistTracks = await bpApiStatic.getArtistTracksAsync(id, 1)
      const transformed = beatportTracksTransform(artistTracks.tracks)
      if (transformed.length === 0) {
        const error = `No tracks found for artist ${id}`
        console.error(error)
        errors.push([error])
        continue
      }

      for (const track of transformed) {
        try {
          await addStoreTrackToUsers('https://www.beatport.com', users, track, { ...source, id })
          await pg.queryAsync(
            // language=PostgreSQL
            sql`-- fetchArtists UPDATE store__artist_watch
UPDATE store__artist_watch
SET
  store__artist_watch_last_update = NOW()
WHERE
    store__artist_id = (SELECT store__artist_id FROM store__artist WHERE store__artist_store_id = ${id})`
          )
        } catch (e) {
          const error = [`Failed to add track to users`, track, users, e]
          console.error(...error)
          errors.push(error)
        }
      }
    } catch (e) {
      const error = [`Failed to fetch tracks for artist with Beatport id ${id}`, e]
      console.error(...error)
      errors.push(error)
    }
  }

  return errors
}

const fetchLabels = async function(jobId) {
  const source = { operation: 'beatport/fetchLabels', jobId }
  const errors = []
  const labelBeatportIds = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- fetchLabels SELECT store__label_store_id
SELECT
  store__label_store_id           AS id
, array_agg(meta_account_user_id) AS users
FROM
  store__label_watch
  NATURAL JOIN store__label
  NATURAL JOIN store
  NATURAL JOIN store__label_watch__user
WHERE
    store_name = 'Beatport'
AND (store__label_watch_last_update IS NULL OR store__label_watch_last_update + INTERVAL '6 hours' < NOW())
GROUP BY
  1, store__label_watch_last_update
ORDER BY
  store__label_watch_last_update DESC NULLS FIRST
LIMIT 50
`
  )

  let count = 1
  for (const { id, users } of labelBeatportIds) {
    try {
      console.log(`Fetching tracks for label ${count}/${labelBeatportIds.length}`)
      count++

      const labelTracks = await bpApiStatic.getLabelTracksAsync(id, 1)
      const transformed = beatportTracksTransform(labelTracks.tracks)
      if (transformed.length === 0) {
        const error = `No tracks found for label ${id}`
        console.error(error)
        errors.push([error])
        continue
      }

      for (const track of transformed) {
        try {
          await addStoreTrackToUsers('https://www.beatport.com', users, track, { ...source, id })
          await pg.queryAsync(
            // language=PostgreSQL
            sql`-- fetchLabels UPDATE store__label_watch
UPDATE store__label_watch
SET
  store__label_watch_last_update = NOW()
WHERE
    store__label_id = (SELECT store__label_id FROM store__label WHERE store__label_store_id = ${id})`
          )
        } catch (e) {
          const error = [`Failed to add track to users`, track, users, e]
          console.error(...error)
          errors.push(error)
        }
      }
    } catch (e) {
      const error = [`Failed to fetch tracks for label with Beatport id ${id}`, e]
      console.error(...error)
      errors.push(error)
    }
  }

  return errors
}

const fetchPlaylists = async function(jobId) {
  const source = { operation: 'beatport/fetchPlaylists', jobId }
  const errors = []
  const beatportPlaylistUrls = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- fetchPlaylists SELECT playlist_store_id
SELECT
  playlist_store_id               AS url
, array_agg(meta_account_user_id) AS users
FROM
  user__playlist_watch
  NATURAL JOIN playlist
  NATURAL JOIN store_playlist_type
  NATURAL JOIN store
WHERE
    store_name = 'Beatport'
AND (playlist_last_update IS NULL OR playlist_last_update + INTERVAL '6 hours' < NOW())
GROUP BY
  1, playlist_last_update
ORDER BY
  playlist_last_update DESC NULLS FIRST
LIMIT 50
`
  )

  let count = 1
  for (const { url, users } of beatportPlaylistUrls) {
    try {
      console.log(`Fetching tracks for playlist ${count}/${beatportPlaylistUrls.length}`)
      count++

      const playlist = await bpApiStatic.getTracksOnPageAsync(url)
      const transformed = beatportTracksTransform(playlist.tracks.tracks)
      if (transformed.length === 0) {
        const error = `No tracks found for playlist at ${url}`
        console.error(error)
        errors.push([error])
        continue
      }

      for (const track of transformed) {
        try {
          await addStoreTrackToUsers('https://www.beatport.com', users, track, { ...source, url })
          await pg.queryAsync(
            // language=PostgreSQL
            sql`-- fetchPlaylists UPDATE playlist
UPDATE playlist
SET
  playlist_last_update = NOW()
WHERE
  playlist_store_id = ${url}`
          )
        } catch (e) {
          const error = [`Failed to add track to users`, track, users, e]
          console.error(...error)
          errors.push(error)
        }
      }
    } catch (e) {
      const error = [`Failed to fetch tracks for label with Beatport url ${url}`, e]
      console.error(...error)
      errors.push(error)
    }
  }

  return errors
}

const fetchBeatportWatches = async ({ id: jobId }) => {
  const errors = []
  errors.concat(await fetchArtists(jobId))
  errors.concat(await fetchLabels(jobId))
  errors.concat(await fetchPlaylists(jobId))
  if (errors.length > 0) {
    return { success: false, result: errors }
  }
  return { success: true }
}

module.exports = fetchBeatportWatches
