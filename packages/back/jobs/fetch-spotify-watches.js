const pg = require('../db/pg.js')
const R = require('ramda')
const sql = require('sql-template-strings')
const { addStoreTrackToUsers } = require('../routes/users/logic.js')
const {
  spotifyTracksTransform,
  spotifyAlbumTracksTransform
} = require('../../chrome-extension/src/js/transforms/spotify')
const spotifyApi = require('../routes/shared/spotify')

const fetchPlaylists = async function(jobId) {
  const source = { operation: 'spotify/fetchPlaylists', jobId }
  const errors = []
  const playlistFollowDetails = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- fetchPlaylists SELECT playlist_store_id
SELECT
  playlist_store_id               AS id
, array_agg(meta_account_user_id) AS users
FROM
  user__playlist_watch
  NATURAL JOIN playlist
  NATURAL JOIN store_playlist_type
  NATURAL JOIN store
WHERE
    store_name = 'Spotify'
AND (playlist_last_update IS NULL OR playlist_last_update + INTERVAL '6 hours' < NOW())
GROUP BY
  1, playlist_last_update
ORDER BY
  playlist_last_update DESC NULLS FIRST
LIMIT 20
`
  )

  let count = 1
  for (const { id, users } of playlistFollowDetails) {
    try {
      console.log(`Fetching tracks for playlist ${count}/${playlistFollowDetails.length}: ${id}`)
      count++

      const res = await spotifyApi.getPlaylistTracks(id)
      const transformed = spotifyTracksTransform(res.body.items.filter(R.path(['track', 'preview_url'])))
      for (const track of transformed) {
        try {
          await addStoreTrackToUsers('https://www.spotify.com', users, track, { ...source, id })
          await pg.queryAsync(
            // language=PostgreSQL
            sql`-- fetchPlaylists UPDATE playlist
UPDATE playlist
SET
  playlist_last_update = NOW()
WHERE
  playlist_store_id = ${id}`
          )
        } catch (e) {
          const error = [`Failed to add track to users`, track, users, e]
          console.error(...error)
          errors.push(error)
        }
      }
    } catch (e) {
      const error = [`Failed to fetch playlist details for ${id}`, e]
      console.error(...error)
      errors.push(error)
    }
  }

  return errors
}

const fetchArtists = async jobId => {
  const source = { operation: 'spotify/fetchArtists', jobId }
  const errors = []
  const artistFollowDetails = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- fetchArtists SELECT store__artist_store_id
SELECT
  store__artist_store_id          AS id
, array_agg(meta_account_user_id) AS users
FROM
  store__artist_watch__user
  NATURAL JOIN store__artist_watch
  NATURAL JOIN store__artist
  NATURAL JOIN store
WHERE
    store_name = 'Spotify'
AND (store__artist_last_update IS NULL OR store__artist_last_update + INTERVAL '6 hours' < NOW())
GROUP BY
  1, store__artist_last_update
ORDER BY
  store__artist_last_update DESC NULLS FIRST
LIMIT 20
`
  )

  let count = 1
  for (const { id, users } of artistFollowDetails) {
    try {
      console.log(`Fetching tracks for artists ${count}/${artistFollowDetails.length}: ${id}`)
      count++

      const albumIds = (await spotifyApi.getArtistAlbums(id)).body.items.map(R.prop('id'))
      // TODO: Store albums as releases
      const albums = (await spotifyApi.getAlbums(albumIds)).body.albums
      const transformed = R.flatten(spotifyAlbumTracksTransform(albums))

      for (const track of transformed) {
        try {
          await addStoreTrackToUsers('https://www.spotify.com', users, track, { ...source, id })
          await pg.queryAsync(
            // language=PostgreSQL
            sql`-- fetchArtists UPDATE store__artist
UPDATE store__artist
SET
  store__artist_last_update = NOW()
WHERE
  store__artist_store_id = ${id}`
          )
        } catch (e) {
          const error = [`Failed to add track to users`, track, users, e]
          console.error(...error)
          errors.push(error)
        }
      }
    } catch (e) {
      const error = [`Failed to fetch tracks for artist with Spotify id ${id}`, e]
      console.error(...error)
      errors.push(error)
    }
  }

  return errors
}

const fetchSpotifyWatches = async ({ id: jobId }) => {
  const errors = []
  errors.concat(await fetchPlaylists(jobId))
  errors.concat(await fetchArtists(jobId))

  if (errors.length > 0) {
    return { success: false, result: errors }
  }
  return { success: true }
}

module.exports = fetchSpotifyWatches
