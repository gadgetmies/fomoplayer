const pg = require('../db/pg.js')
const R = require('ramda')
const sql = require('sql-template-strings')
const { addStoreTrackToUsers } = require('../routes/users/logic.js')
const { spotifyTracksTransform } = require('../../chrome-extension/src/js/transforms/spotify')
const spotifyApi = require('../routes/shared/spotify')

const fetchPlaylists = async function() {
  const playlistFollowDetails = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`SELECT playlist_store_id               AS id,
       array_agg(meta_account_user_id) AS users
FROM user__playlist_watch
         NATURAL JOIN playlist
         NATURAL JOIN store
WHERE store_name = 'Spotify'
  AND (user__playlist_watch_last_update IS NULL OR user__playlist_watch_last_update + interval '6 hours' < NOW())
GROUP BY 1, user__playlist_watch_last_update
ORDER BY user__playlist_watch_last_update DESC NULLS FIRST
LIMIT 20
`
  )

  let count = 1
  for (const { id, users } of playlistFollowDetails) {
    try {
      console.log(`Fetching tracks for playlist ${count}/${playlistFollowDetails.length}`)
      count++

      const res = await spotifyApi.getPlaylistTracks(id)
      const transformed = spotifyTracksTransform(res.body.items.filter(R.path(['track', 'preview_url'])))
      try {
        for (const track of transformed) {
          await addStoreTrackToUsers('https://www.spotify.com', users, track)
        }
      } catch (e) {
        console.error(`Failed to fetch tracks for artist with Spotify id ${id}`, e)
      }

      await pg.queryAsync(
        // language=PostgreSQL
        sql`UPDATE user__playlist_watch
SET user__playlist_watch_last_update = NOW()
WHERE playlist_id = (SELECT playlist_id FROM playlist WHERE playlist_store_id = ${id})`
      )
    } catch (e) {
      console.error(e)
    }
  }
}
const fetchSpotifyWatches = async () => {
  await fetchPlaylists()
}

module.exports = fetchSpotifyWatches
